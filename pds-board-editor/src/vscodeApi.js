/**
 * vscodeApi.js
 * Convenience wrapper around the VS Code API bridge.
 * window.__vscodeApi is set by the extension's injected bridge <script>,
 * which runs as a synchronous inline script BEFORE this deferred module runs.
 */

export function postMessage(msg) {
  window.__vscodeApi?.postMessage(msg)
}

export function isVSCode() {
  return Boolean(window.__isVSCodeWebview)
}
