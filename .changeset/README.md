# Changesets

发布流程：

1. `pnpm changeset` 生成 changeset 描述
2. `pnpm version-packages` 升级版本号（同步根 package.json）
3. `pnpm release` 构建并发布到 npm
