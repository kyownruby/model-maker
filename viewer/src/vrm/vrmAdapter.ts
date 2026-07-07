import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'
import type { ModelAdapter, ParameterInfo } from '../core/types'

/** 正規化値(-1..1)を関節の回転角へ変換する係数 */
const HEAD_RANGE_RAD = THREE.MathUtils.degToRad(40)
const BODY_RANGE_RAD = THREE.MathUtils.degToRad(20)
/** 視線ターゲットを動かす範囲（モデル正面 z=+2 の平面上） */
const LOOK_RANGE_X = 1.5
const LOOK_RANGE_Y = 0.8

interface BoneParam {
  bone: THREE.Object3D
  axis: 'x' | 'y' | 'z'
  rangeRad: number
}

export async function createVrmAdapter(
  container: HTMLElement,
  modelUrl: string,
): Promise<ModelAdapter> {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.setSize(container.clientWidth, container.clientHeight)
  // OBS取り込みを見据えて背景は透過。ページ側の背景色がそのまま見える
  renderer.setClearColor(0x000000, 0)
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(
    30,
    container.clientWidth / container.clientHeight,
    0.1,
    20,
  )
  camera.position.set(0, 1.35, 2.2)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 1.1, 0)
  controls.update()

  scene.add(new THREE.AmbientLight(0xffffff, 0.6))
  const light = new THREE.DirectionalLight(0xffffff, Math.PI * 0.6)
  light.position.set(1, 2, 3)
  scene.add(light)

  const loader = new GLTFLoader()
  loader.register((parser) => new VRMLoaderPlugin(parser))
  const gltf = await loader.loadAsync(modelUrl)
  const vrm = gltf.userData.vrm as VRM

  // VRM0モデルは-Z向きで読み込まれるため+Z向きに補正、不要な頂点等も削減
  VRMUtils.removeUnnecessaryVertices(gltf.scene)
  VRMUtils.combineSkeletons(gltf.scene)
  if (vrm.meta?.metaVersion === '0') {
    VRMUtils.rotateVRM0(vrm)
  }
  scene.add(vrm.scene)

  // 視線制御: lookAtターゲットを正規化値で動かす
  const lookAtTarget = new THREE.Object3D()
  lookAtTarget.position.set(0, 1.4, 2)
  camera.add(lookAtTarget)
  scene.add(camera)
  if (vrm.lookAt) {
    vrm.lookAt.target = lookAtTarget
  }
  const lookAtValues = { x: 0, y: 0 }

  // ボーン回転パラメータ（首・体）
  const boneParams = new Map<string, BoneParam>()
  const boneValues = new Map<string, number>()
  const registerBone = (
    group: string,
    name: string,
    boneName: Parameters<NonNullable<typeof vrm.humanoid>['getNormalizedBoneNode']>[0],
    axis: 'x' | 'y' | 'z',
    rangeRad: number,
  ) => {
    const bone = vrm.humanoid?.getNormalizedBoneNode(boneName)
    if (bone) {
      boneParams.set(`${group}.${name}`, { bone, axis, rangeRad })
      boneValues.set(`${group}.${name}`, 0)
    }
  }
  registerBone('head', 'pitch', 'head', 'x', HEAD_RANGE_RAD)
  registerBone('head', 'yaw', 'head', 'y', HEAD_RANGE_RAD)
  registerBone('head', 'roll', 'head', 'z', HEAD_RANGE_RAD)
  registerBone('body', 'pitch', 'spine', 'x', BODY_RANGE_RAD)
  registerBone('body', 'yaw', 'spine', 'y', BODY_RANGE_RAD)
  registerBone('body', 'roll', 'spine', 'z', BODY_RANGE_RAD)

  const expressionNames: string[] =
    vrm.expressionManager?.expressions.map((e) => e.expressionName) ?? []

  const clock = new THREE.Clock()
  let disposed = false
  const renderLoop = () => {
    if (disposed) return
    requestAnimationFrame(renderLoop)
    const delta = clock.getDelta()

    // ボーン回転は毎フレーム適用（normalized boneはvrm.updateでrawへ反映される）
    for (const [id, p] of boneParams) {
      const v = boneValues.get(id) ?? 0
      p.bone.rotation[p.axis] = v * p.rangeRad
    }
    lookAtTarget.position.x = lookAtValues.x * LOOK_RANGE_X
    lookAtTarget.position.y = 1.4 + lookAtValues.y * LOOK_RANGE_Y

    vrm.update(delta)
    renderer.render(scene, camera)
  }
  renderLoop()

  const onResize = () => {
    camera.aspect = container.clientWidth / container.clientHeight
    camera.updateProjectionMatrix()
    renderer.setSize(container.clientWidth, container.clientHeight)
  }
  window.addEventListener('resize', onResize)

  const parameters: ParameterInfo[] = [
    ...expressionNames.map((name) => ({
      id: `expression.${name}`,
      label: name,
      group: 'expression',
      min: 0,
      max: 1,
      defaultValue: 0,
    })),
    { id: 'lookAt.x', label: 'lookAt X (左右)', group: 'lookAt', min: -1, max: 1, defaultValue: 0 },
    { id: 'lookAt.y', label: 'lookAt Y (上下)', group: 'lookAt', min: -1, max: 1, defaultValue: 0 },
    ...[...boneParams.keys()].map((id) => ({
      id,
      label: id,
      group: id.split('.')[0],
      min: -1,
      max: 1,
      defaultValue: 0,
    })),
  ]

  return {
    kind: 'vrm',
    modelName: vrm.meta && 'name' in vrm.meta ? ((vrm.meta as { name?: string }).name ?? 'VRM') : 'VRM',

    listParameters: () => parameters,

    getParameter: (id) => {
      if (id.startsWith('expression.')) {
        return vrm.expressionManager?.getValue(id.slice('expression.'.length)) ?? undefined
      }
      if (id === 'lookAt.x') return lookAtValues.x
      if (id === 'lookAt.y') return lookAtValues.y
      return boneValues.get(id)
    },

    setParameter: (id, value) => {
      if (id.startsWith('expression.')) {
        vrm.expressionManager?.setValue(id.slice('expression.'.length), value)
      } else if (id === 'lookAt.x') {
        lookAtValues.x = value
      } else if (id === 'lookAt.y') {
        lookAtValues.y = value
      } else if (boneValues.has(id)) {
        boneValues.set(id, value)
      }
    },

    resetAll: () => {
      for (const name of expressionNames) vrm.expressionManager?.setValue(name, 0)
      lookAtValues.x = 0
      lookAtValues.y = 0
      for (const id of boneValues.keys()) boneValues.set(id, 0)
    },

    dispose: () => {
      disposed = true
      window.removeEventListener('resize', onResize)
      controls.dispose()
      VRMUtils.deepDispose(vrm.scene)
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}
