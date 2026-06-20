cd apps/api/docker/
docker compose up -d

cd apps/api/
pnpm dev

cd apps/web/
pnpm dev

cd Documents/Code/Onos/ToolClassification
claude

chmod +x /var/www/onosfactory/current/deploy.sh
cd /var/www/onosfactory/current
./deploy.sh

cd /var/www/onosfactory/current/apps/api
nano .env.production
