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

vps-----
DB_URI=$(grep '^DB_URI=' /var/www/onosfactory/current/apps/api/.env.production | cut -d= -f2- | tr -d '"'"'")
echo "$DB_URI"
mongodump --uri="$DB_URI" --archive=/tmp/onos-$(date +%Y%m%d).archive --gzip
ls -lh /tmp/onos-\*.archive
local-----
scp nam@157.11.11.111:/tmp/onos-20260628.archive ./

mongorestore --uri="mongodb://localhost:27017/?directConnection=true" --archive=./onos-20260630.archive --gzip --drop --nsFrom='onosfactory-prod._' --nsTo='onos-classifycation._'
