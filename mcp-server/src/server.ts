#!/usr/bin/env node
/**
 * model-maker MCPサーバー（司令塔）。
 * - Claude Code とは stdio で接続（登録方法は mcp-server/README.md 参照）
 * - モデルビューアとは WebSocket (localhost) で接続
 *
 * 注意: stdio がMCPのプロトコルチャネルなので、console.log は使わないこと（stderrのみ）。
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { ViewerBridge } from './viewerBridge.js'
import { DEFAULT_WS_PORT } from './protocol.js'

const wsPort = Number(process.env.MODEL_MAKER_WS_PORT ?? DEFAULT_WS_PORT)
const bridge = new ViewerBridge(wsPort)

const server = new McpServer({
  name: 'character-model',
  version: '0.1.0',
})

/** ツール実行の共通ラッパ: ビューアへ転送し、結果をMCPのcontentへ変換する */
async function run(action: Parameters<ViewerBridge['send']>[0], args: Record<string, unknown> = {}) {
  try {
    const result = await bridge.send(action, args)
    return {
      content: [
        {
          type: 'text' as const,
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        },
      ],
    }
  } catch (error) {
    return {
      content: [
        { type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` },
      ],
      isError: true,
    }
  }
}

server.registerTool(
  'list_parameters',
  {
    description:
      '現在ビューアに表示中のモデルが持つ、操作可能なパラメータ・表情・モーションの一覧を返す。' +
      'モデルに何ができるかを知るため、他のツールを使う前にまずこれを呼ぶこと。',
    inputSchema: {},
  },
  () => run('listParameters'),
)

server.registerTool(
  'set_parameter',
  {
    description:
      '任意のパラメータIDに値を直接設定する（list_parametersで取得したIDと範囲を使うこと）。' +
      '高レベルツール（set_expression / look_at 等）で足りない細かい操作に使う。',
    inputSchema: {
      id: z.string().describe('パラメータID（例: "param.ParamAngleX", "expression.happy"）'),
      value: z.number().describe('設定する値（list_parametersのmin/max範囲内）'),
    },
  },
  ({ id, value }) => run('setParameter', { id, value }),
)

server.registerTool(
  'set_expression',
  {
    description:
      '表情を設定する。表情名は list_parameters の expressions から選ぶ。' +
      'VRMでは smile→happy などの一般名エイリアスも解決される。weight=0 でその表情を解除。',
    inputSchema: {
      name: z.string().describe('表情名（例: happy / angry / sad / surprised / smile）'),
      weight: z.number().min(0).max(1).default(1).describe('表情の強さ 0.0〜1.0'),
    },
  },
  ({ name, weight }) => run('setExpression', { name, weight }),
)

server.registerTool(
  'look_at',
  {
    description: '目線と顔の向きを設定する。x, y は正規化値（0が正面）。',
    inputSchema: {
      x: z.number().min(-1).max(1).describe('左右方向 -1.0（左）〜1.0（右）'),
      y: z.number().min(-1).max(1).describe('上下方向 -1.0（下）〜1.0（上）'),
    },
  },
  ({ x, y }) => run('lookAt', { x, y }),
)

server.registerTool(
  'set_body_angle',
  {
    description: '体の向き・傾きを設定する。各軸は正規化値（0が正面直立）。',
    inputSchema: {
      x: z.number().min(-1).max(1).default(0).describe('左右の向き（yaw）'),
      y: z.number().min(-1).max(1).default(0).describe('前後の傾き（pitch）'),
      z: z.number().min(-1).max(1).default(0).describe('左右の傾き（roll）'),
    },
  },
  ({ x, y, z }) => run('setBodyAngle', { x, y, z }),
)

server.registerTool(
  'set_mouth',
  {
    description: '口の開き具合を設定する（口パク用）。',
    inputSchema: {
      open: z.number().min(0).max(1).describe('口の開き 0.0（閉）〜1.0（全開）'),
    },
  },
  ({ open }) => run('setMouth', { open }),
)

server.registerTool(
  'play_motion',
  {
    description:
      'モーション（アニメーション）を再生する。モーション名は list_parameters の motions から選ぶ。' +
      '現状Live2Dモデルのみ対応。',
    inputSchema: {
      name: z.string().describe('モーショングループ名（例: idle / tap_body）'),
    },
  },
  ({ name }) => run('playMotion', { name }),
)

server.registerTool(
  'load_model',
  {
    description:
      '別のモデルを読み込む。URLの拡張子で種類を判定する（.vrm → VRM、.model3.json → Live2D）。',
    inputSchema: {
      url: z.string().describe('モデルのURL（viewerから見えるパス or http(s) URL）'),
    },
  },
  ({ url }) => run('loadModel', { url }),
)

server.registerTool(
  'get_status',
  {
    description: 'ビューアの接続状態と表示中のモデル情報を返す。',
    inputSchema: {},
  },
  async () => {
    if (!bridge.connected) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ viewerConnected: false }, null, 2),
          },
        ],
      }
    }
    return run('getStatus')
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)
console.error('[mcp-server] character-model MCP server running on stdio')
