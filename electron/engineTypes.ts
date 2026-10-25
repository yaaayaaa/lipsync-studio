// renderer（src）と main/preload（electron）の間でやり取りする形。
// 型だけのファイルにしておくのは、src 側が `import type` で読んでも実行時に何も束ねられないようにするため。
// IPC は structured clone を通るので、Headers や Response は渡せず、素のオブジェクトと ArrayBuffer にする。

export interface EngineRequest {
  url: string
  method: 'GET' | 'POST'
  headers: Record<string, string>
  body?: string
}

export interface EngineResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  body: ArrayBuffer
}

export interface DesktopBridge {
  engineFetch(req: EngineRequest): Promise<EngineResponse>
}
