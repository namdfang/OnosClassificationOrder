cd apps/api/docker/
docker compose up -d

cd apps/api/
pnpm dev

cd apps/web/
pnpm dev

cd Documents/Code/Onos/ToolClassification
claude

chmod +x /var/www/printera/printera/deploy.sh
cd /var/www/printera/printera
./deploy.sh

cd /var/www/printera/printera/apps/api
nano .env.production
