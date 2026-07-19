# 梗一下

一个在线表情包创作工具，包含四条创作路线：

- 用一句感受生成三套表情包文案
- 用提示词直接生成表情包，或上传参考图后重画
- 上传图片，在本地叠加文案、版式与字体
- 在浏览器中把视频片段转换成 GIF

## 本地开发

需要 Node.js `>=22.13.0`。

```bash
npm install
npm run dev
```

生产构建与测试：

```bash
npm run build
npm test
```

## AI 接口

网页右上角的「AI 设置」支持 OpenAI-compatible 服务：

- `Base URL`：API 根地址，通常以 `/v1` 结尾
- `API Key`：仅保存在当前浏览器会话
- `Text Model Name`：用于心情文案生成
- `Image Model Name`：用于提示词生图和参考图编辑

生图服务需要兼容 Images API：纯提示词调用 `/images/generations`，参考图调用 `/images/edits`。站点端也可通过 `OPENAI_API_KEY`、`OPENAI_MODEL` 与 `OPENAI_IMAGE_MODEL` 提供默认服务。

提示词会被服务端固定的表情包系统提示词约束，优先生成 1:1、主体清楚、适合聊天转发的单张表情包。手动图片编辑与视频转 GIF 完全在浏览器处理；AI 生图的提示词和可选参考图会发送给当前配置的 AI 服务。
