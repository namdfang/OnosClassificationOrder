cd apps/api/docker/
docker compose up -d

cd apps/api/
pnpm dev

cd apps/web/
pnpm dev

cd ~/Code/ToolClassification
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
ls -lh /tmp/onos-20260713.archive
local-----
scp nam@157.11.11.111:/tmp/onos-20260713.archive ./

mongorestore --uri="mongodb://localhost:27017/?directConnection=true" --archive=./onos-20260713.archive --gzip --drop --nsFrom='onosfactory-prod._' --nsTo='onos-classifycation._'
