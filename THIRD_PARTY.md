# Third-party components

Orbit integrates independently distributed open-source components, not AdsPower's code or browser binaries.

- Camoufox browser: Mozilla Public License 2.0. Browser binaries from official release v156.0.1-beta.36: https://github.com/daijro/camoufox/releases/tag/v156.0.1-beta.36 . Corresponding source: https://github.com/daijro/camoufox/tree/v156.0.1-beta.36 . Original notices and bundled font licences are retained in resources/native-engine/camoufox.
- Camoufox TypeScript launcher 0.5.8: MIT. https://github.com/daijro/camoufox/tree/main/typescript . The installed package retains its THIRD_PARTY_NOTICES.md, including the Apache-2.0 fingerprint generator port.
- Fingerprint model: official hash-pinned model-2/2026 from https://github.com/scrapfly/fingerprint-generator . The model archive and each extracted member are verified against Camoufox's published SHA-256 values during preparation.
- Electron 44.9.0, Chromium, Playwright Core 1.62.0 and dependency notices are retained in their distributed packages.

Browser executables and shared libraries retain the upstream release bytes. Orbit customizes camoufox.cfg, defaults/pref/orbit-new-tab.js and distribution/policies.json for its Google new-tab and search behavior. Windows filesystem encryption attributes of the download cache are not copied to the distributable folder so the OS loader can read its assemblies.

- Streaming backup ZIP: yazl 3.3.1 and yauzl 3.4.0 (MIT), with their dependency licences retained in the distributed packages. Sources: https://github.com/thejoshwolfe/yazl and https://github.com/thejoshwolfe/yauzl .

- Koffi 3.3.3 (MIT): https://koffi.dev/ and https://github.com/Koromix/koffi . Windows API binding used for startup CPU affinity; native package licences are retained.
# 独立更新助手

Node.js v24.21.0，来自本机已安装且 Authenticode 签名有效的官方 Node.js Windows x64 运行库。仅用于关闭主程序后的文件替换与启动检查。原始许可与第三方声明位于 `resources/update-runtime/LICENSE.txt`，来源记录在 `NOTICE.txt`。发布签名使用本机生成的 Ed25519 密钥，私钥不随程序分发。

