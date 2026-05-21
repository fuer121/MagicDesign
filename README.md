# MagicDesign Poster Studio

活动/节目主视觉快速生成工具。V1 面向本机/内网内部使用，用阶段式向导把人物定妆照、Logo、文案、背景参考图组合成可传播海报初稿。

## 功能

- 5 人海报流程：人数选择、站位模板、人物定妆照上传、人物融合、人工确认、背景融合、Logo/文案排版、尺寸导出。
- 内置 2 张五人站位线图，支持上传补充站位图。
- 读取项目目录中的 3 份 Prompt：人物站位融合、背景与初稿融合、节目 Logo/文案融合。
- 服务端调用 OpenAI 图像接口；未配置 `OPENAI_API_KEY` 时自动使用本地 mock 图，方便先跑通流程。
- 最终海报使用 Canvas 精确合成 Logo 和中文文案，支持 3:4、9:16、2:3 与自定义尺寸。
- 每次上传、生成、导出都会写入本地项目历史。

## 启动

```bash
npm install
cp .env.example .env
npm run dev
```

打开：

```text
http://localhost:5188/
```

API 服务：

```text
http://localhost:8787/
```

## OpenAI 配置

在 `.env` 中填写：

```bash
OPENAI_API_KEY=你的服务端密钥
OPENAI_BASE_URL=
OPENAI_IMAGE_BASE_URL=
OPENAI_TEXT_BASE_URL=
OPENAI_IMAGE_MODEL=gpt-image-2
OPENAI_TEXT_MODEL=gpt-5.5
OPENAI_REVIEW_MODEL=gpt-5.5
PORT=8787
```

不要把 API Key 放到前端，也不要从 `APIKey.rtf` 直接给浏览器读取。当前实现只在 Node 服务端读取环境变量。使用 OpenAI 兼容网关时，可在 `OPENAI_IMAGE_BASE_URL` 和 `OPENAI_TEXT_BASE_URL` 分别配置图片与文本接口；只填 `OPENAI_BASE_URL` 时两者共用同一个地址。地址可以填网关根地址，服务端会自动规范化到 `/v1`。

如果日志出现 `Image generation is not enabled for this group`，说明当前 key 或代理账号组没有开启图片生成权限；文本模型仍可用于 Prompt 优化，但人物/背景出图会降级为本地 mock。

## 本地目录

- `uploads/`：上传素材
- `generated/`：OpenAI 或 mock 生成图
- `exports/`：Canvas 导出的最终 PNG
- `data/projects/`：项目历史 JSON
- `public/standing-templates/`：内置站位模板

## 验证

```bash
npm run build
```

没有 API Key 时也可以在页面中使用“使用目录中的示例素材”跑通人物融合 mock 流程。
