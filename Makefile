DB := kumon-ikanai-mon-db
WRANGLER := pnpm exec wrangler

.PHONY: deploy migrate

deploy: ## デプロイ（install→型チェック→deploy）
	pnpm install
	pnpm typecheck
	$(WRANGLER) deploy

migrate: ## DBマイグレーション適用（本番）
	$(WRANGLER) d1 migrations apply $(DB) --remote
