# My Dance Diary

一个用 Vibe Coding 做出来的 Y2K 风格练舞打卡工具。它把课程表、出勤、自评分、课程难度、舞力值和实时单节课价放进同一本可交互的练舞日记。

仓库只包含匿名示例配置，不包含原作者的真实课表、老师姓名、会员卡金额、打卡记录或线上部署信息。

## 功能

- 月视图与周视图，周日作为每周第一列
- 按时间段组织课程，同一时间段一次只记录一节课
- 每行两个课程 Tab，适合快速选择同场课程
- 1–5 分课后自评，覆盖跟课、放炮、SOLO 与共舞表现
- 舞力值：课程难度 `D1–D4 × 自评分 S1–S5`，满分 20
- 实时单节课价：总投入 ÷ 已打卡课次
- 自动用中国时间定位到前一天，方便补记昨天的课程
- 数据只保存在当前浏览器的 `localStorage` 中

## 自定义

打开 [`app/dance-config.ts`](app/dance-config.ts)，替换以下匿名示例内容：

- `ANNUAL_SPEND`：你的课程总投入
- `TARGET_COUNT`：年度练舞目标
- `DEFAULT_START` / `DEFAULT_END`：记录周期
- `SCHEDULE`：按星期配置课程、时间、舞种、老师代称和难度

星期使用 JavaScript 约定：`0` 是周日，`1` 是周一，依此类推。

## 本地运行

需要 Node.js 22.13 或更高版本。

```bash
npm install
npm run dev
```

生产构建与测试：

```bash
npm test
```

## 隐私说明

打卡与评分不会写入源码，也不会自动上传到服务器；它们默认只保存在访问者当前设备的浏览器中。清除浏览器数据后记录会丢失，不同设备之间也不会自动同步。

## 项目口播

产品介绍框架与可直接录制的口播稿位于 [`docs/product-pitch-script.md`](docs/product-pitch-script.md)。

## License

[MIT](LICENSE)
