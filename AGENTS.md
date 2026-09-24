# 仓库协作约定

- 用户已授权：本仓库的功能开发或修复完成并通过验证后，自动提交代码、推送到远程仓库并部署，无需逐次确认。用户在具体任务中另有要求时，以该要求为准。
- 提交仅包含当前任务的相关改动；推送前检查远程更新，不强制覆盖远程历史。
- 发布前完成适用的验证：`npm test`（包含生产构建）、`npx tsc --noEmit`、`npm run lint`；涉及交互时验证相关浏览器流程。
- 当前远程为 `origin`（`git@github.com:umuo/emoji.git`），生产分支为 `main`。部署现有 Cloudflare Worker `emoji`，使用已验证的构建配置：`npx wrangler deploy --config dist/server/wrangler.json`。
- 部署后检查线上页面或受影响的功能，并报告提交号与部署结果。线上地址为 https://emoji.gitsilence.workers.dev 。
- 如果验证、推送或部署失败，应解决可修复的问题；遇到无法自行解决的阻碍时明确报告，不将未完成的步骤表述为成功。
