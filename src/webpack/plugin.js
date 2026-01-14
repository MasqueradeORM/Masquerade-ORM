
import { store } from "./store.js"

import { nodeArr2ClassDict } from "../ORM/bootOrm.js"

export class MasqueradePlugin {
  apply(compiler) {
    compiler.hooks.compilation.tap(this.constructor.name, (compilation) => {
      compilation.hooks.processAssets.tap(
        {
          name: this.constructor.name,
          stage: compilation.constructor.PROCESS_ASSETS_STAGE_ADDITIONS,
        },
        (assets) => {
          const classDict = nodeArr2ClassDict(store.nodeArr)
          const prefix = `globalThis.masqueradeClassDict_ = ${JSON.stringify(classDict)};\n`

          for (const entry of compilation.entrypoints.values()) {
            for (const file of entry.getFiles()) {
              if (!file.endsWith(".js")) continue

              const asset = compilation.getAsset(file)
              const source = asset.source.source()

              compilation.updateAsset(
                file,
                new compiler.webpack.sources.RawSource(prefix + source)
              )
            }
          }
        }
      )
    })
  }
}








