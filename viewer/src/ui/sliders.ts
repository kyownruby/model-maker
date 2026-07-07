import type { ModelAdapter, ParameterInfo } from '../core/types'

/**
 * アダプタの listParameters() からスライダーUIを動的生成する。
 * モデルごとにパラメータ構成が違っても、この関数がそのまま吸収する
 * （MCPの list_parameters と同じ思想）。
 */
export function buildSliderPanel(root: HTMLElement, adapter: ModelAdapter): void {
  root.innerHTML = ''

  const groups = new Map<string, ParameterInfo[]>()
  for (const param of adapter.listParameters()) {
    const list = groups.get(param.group) ?? []
    list.push(param)
    groups.set(param.group, list)
  }

  for (const [group, params] of groups) {
    const section = document.createElement('div')
    section.className = 'slider-group'
    const heading = document.createElement('h3')
    heading.textContent = group
    section.appendChild(heading)

    for (const param of params) {
      section.appendChild(createSliderRow(adapter, param))
    }
    root.appendChild(section)
  }
}

function createSliderRow(adapter: ModelAdapter, param: ParameterInfo): HTMLElement {
  const row = document.createElement('div')
  row.className = 'slider-row'

  const label = document.createElement('label')
  label.textContent = param.label
  label.title = param.id

  const slider = document.createElement('input')
  slider.type = 'range'
  slider.min = String(param.min)
  slider.max = String(param.max)
  slider.step = String((param.max - param.min) / 200)
  slider.value = String(adapter.getParameter(param.id) ?? param.defaultValue)
  slider.dataset.paramId = param.id

  const output = document.createElement('output')
  output.textContent = Number(slider.value).toFixed(2)

  slider.addEventListener('input', () => {
    const value = Number(slider.value)
    adapter.setParameter(param.id, value)
    output.textContent = value.toFixed(2)
  })

  row.append(label, slider, output)
  return row
}

/** Reset All 後にスライダーの表示値を現在値へ同期する */
export function syncSliderValues(root: HTMLElement, adapter: ModelAdapter): void {
  root.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach((slider) => {
    const id = slider.dataset.paramId
    if (!id) return
    const value = adapter.getParameter(id)
    if (value === undefined) return
    slider.value = String(value)
    const output = slider.parentElement?.querySelector('output')
    if (output) output.textContent = value.toFixed(2)
  })
}
