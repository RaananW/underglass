---
"@underglass/vue": patch
---

A Vue application whose first render throws now makes `mountCanvasApp` throw that error, as the React adapter does. The app is unmounted and the hosts are left as they were, so they can take another mount. Before, Vue's production build only logged the error and the mount returned a working controller over an incomplete app, and Vue's development build threw but left the failed app's `Surface` registration in Vue's queue, where it threw again at the next update and stopped later mounts on the page from registering their layers. The error goes to the caller of `mountCanvasApp`, not to an `errorHandler` set in `configure`; that handler gets the errors after the mount, as before. An `onErrorCaptured` hook that returns `false` for the error still contains it, and the mount succeeds.
