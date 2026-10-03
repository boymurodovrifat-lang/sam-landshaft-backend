# Sam-Landshaft Backend — VPS Deploy qo'llanmasi

Contabo VPS (Ubuntu 24.04 LTS) ga deploy qilish uchun.

## Bir martalik sozlash

### 1. VPS'ga kirish

```bash
ssh root@your-vps-ip
```

### 2. Foydalanuvchi yaratish (agar root bo'lsangiz)

```bash
adduser samlandshaft
usermod -aG sudo samlandshaft
su - samlandshaft
```

### 3. Dependencies o'rnatish

```bash
# System update
sudo apt update && sudo apt upgrade -y

# Node.js 22 LTS (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# PostgreSQL 16
sudo apt install -y postgresql-16 postgresql-contrib-16

# GDAL (GeoTIFF qayta ishlash)
sudo apt install -y gdal-bin

# FFmpeg (video eksport)
sudo apt install -y ffmpeg

# Nginx + Certbot (HTTPS)
sudo apt install -y nginx certbot python3-certbot-nginx

# PM2 (process manager)
sudo npm install -g pm2

# Git
sudo apt install -y git

# Tekshirish
node -v && npm -v && psql --version && gdalinfo --version && ffmpeg -version | head -1
```

### 4. PostgreSQL sozlash

```bash
sudo -u postgres psql
```

```sql
CREATE USER samlandshaft WITH PASSWORD 'STRONG-PASSWORD-HERE';
CREATE DATABASE sam_landshaft OWNER samlandshaft;
\c sam_landshaft
CREATE EXTENSION IF NOT EXISTS postgis;
\q
```

### 5. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

## Birinchi deploy

### 1. Kod klonlash

```bash
mkdir -p ~/apps && cd ~/apps
git clone YOUR-REPO-URL sam-landshaft-backend
cd sam-landshaft-backend
```

### 2. Environment fayl

```bash
cp .env.example .env
nano .env
```

O'rnating:
```
DATABASE_URL="postgresql://samlandshaft:STRONG-PASSWORD@localhost:5432/sam_landshaft?schema=public"
JWT_SECRET=<openssl rand -hex 64 bilan yarating>
CORS_ORIGIN=https://sam-landshaft.uz,https://admin.sam-landshaft.uz
SEED_ADMIN_EMAIL=admin@sam-landshaft.uz
SEED_ADMIN_PASSWORD=<kamida 16 belgili noyob parol>
UPLOAD_DIR=/home/samlandshaft/storage/uploads
COG_DIR=/home/samlandshaft/storage/cog
VIDEO_DIR=/home/samlandshaft/storage/videos
```

### 3. Deploy skript

```bash
chmod +x deploy.sh
./deploy.sh
```

### 4. Admin yaratish (birinchi marta)

```bash
npm run prisma:seed
```

### 5. Nginx

```bash
sudo cp nginx.sample.conf /etc/nginx/sites-available/api.sam-landshaft.uz
sudo ln -s /etc/nginx/sites-available/api.sam-landshaft.uz /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 6. SSL (HTTPS)

```bash
sudo certbot --nginx -d api.sam-landshaft.uz
```

Avto-yangilanish tekshirish:
```bash
sudo certbot renew --dry-run
```

### 7. Tekshirish

```bash
curl https://api.sam-landshaft.uz/api/categories
pm2 status
pm2 logs sam-landshaft-api
```

## Keyingi deploy'lar

```bash
cd ~/apps/sam-landshaft-backend
git pull
./deploy.sh
```

## Foydali PM2 buyruqlari

```bash
pm2 status                          # Status
pm2 logs sam-landshaft-api          # Loglar
pm2 restart sam-landshaft-api       # Qayta ishga tushirish
pm2 stop sam-landshaft-api          # To'xtatish
pm2 save                            # PM2 state saqlash
pm2 startup                         # Tizim bilan avtoishga tushish
```

## Backup

### PostgreSQL

```bash
# Kundalik backup cron
crontab -e

# Har kuni 03:00 da
0 3 * * * pg_dump -U samlandshaft sam_landshaft | gzip > /home/samlandshaft/backups/db_$(date +\%Y\%m\%d).sql.gz
0 4 * * 0 find /home/samlandshaft/backups/ -name "db_*.sql.gz" -mtime +30 -delete
```

### Storage (GeoTIFF fayllar)

```bash
# Haftalik rsync tashqi serverga (opsional)
0 2 * * 0 rsync -avz /home/samlandshaft/storage/ backup-server:/backups/sam-landshaft/
```

## Monitoring

- **UptimeRobot**: https://api.sam-landshaft.uz/api ni 5 daqiqada tekshirish
- **PM2**: `pm2 monit` — real-time CPU/RAM monitoring
- **Logs**: `~/apps/sam-landshaft-backend/logs/`

## Muammo bartarafi

### Backend ishga tushmayapti
```bash
pm2 logs sam-landshaft-api --lines 100
```

### DB ulanmayapti
```bash
psql -U samlandshaft -d sam_landshaft -h localhost
```

### Fayl yuklash xatolik beradi
```bash
# Storage papkalari huquqlarini tekshiring
ls -la storage/
chmod -R 755 storage/
```

### Disk to'lib qoldi
```bash
df -h                                                # disk holati
du -sh /home/samlandshaft/storage/*                 # qaysi papka katta
pm2 flush                                            # loglarni tozalash
```


## Xavfsizlik tuzatishlarini mavjud serverga o‘rnatish

Avval PostgreSQL bazasi va raster omborining zaxira nusxasini oling. `.env` faylini
ommaviy repozitoriyga joylamang (`chmod 600 .env`). `JWT_SECRET` uchun yangi tasodifiy
kalit tayyorlang. Kalit yangilanganda barcha eski administrator sessiyalari bekor bo‘ladi.

`HOST=127.0.0.1` mahalliy Nginx uchun standart. Dockerda `HOST=0.0.0.0` ishlatiladi;
host portini faqat mahalliy interfeysga chiqaring: `127.0.0.1:3000:3000`.
Tashqi load balancer uchun ishonchli proxy manzillarini alohida moslashtiring;
foydalanuvchi bergan `X-Forwarded-For` sarlavhasiga ko‘r-ko‘rona ishonmang.

Bu versiya dastlabki Prisma migratsiyasini qo‘shadi. **Mavjud, ma’lumotli bazada**
uni yaratish migratsiyasi sifatida ishga tushirmang. Zaxira olingach, uning amaldagi
sxemasini `prisma/schema.prisma` bilan tekshiring. Quyidagi tekshiruv sxema teng
bo‘lsa 0, farqlar bo‘lsa 2 kod bilan tugaydi:

```bash
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code
```

Bu buyruq uchun `DATABASE_URL` xavfsiz server muhitida o‘rnatilgan bo‘lishi kerak;
`.env` avtomatik shell o‘zgaruvchisi emas. Farqlarni alohida ko‘rib chiqing.
**Faqat sxema tengligi tasdiqlangandan keyin**, migratsiyasiz eski bazani boshlang‘ich
holat sifatida belgilang:

```bash
npx prisma migrate resolve --applied 20261003000000_initial
```

Yangi bo‘sh bazada bu belgilash kerak emas; `prisma migrate deploy` jadvallarni yaratadi.
`deploy.sh` migratsiya xatosida to‘xtaydi va ma’lumot yo‘qotishni qabul qilmaydi.

Eski administrator paroli seedni qayta ishga tushirish bilan o‘zgarmaydi. `.env`da
tegishli email va yangi kuchli parolni xavfsiz o‘rnating, keyin:

```bash
npm run prisma:admin-password
```

Yangilangan JWT kaliti bilan API qayta ishga tushirilgach, yangi parol bilan kiring.
Bu qo‘llanma serverda buyruqlar bajarilgan yoki maxfiy kalit almashtirilganini anglatmaydi.
