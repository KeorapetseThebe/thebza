# BrandItWithBrandon - Admin Upgrade

This version adds two role-based admin accounts, owner service/price editing, and owner background-image upload.

## Admin accounts

### Clerk
- Username: `clerk`
- Password: `Clerk123!`
- Can view bookings, filter appointments, mark completed, and cancel/restore bookings.
- Cannot edit services, prices, or website appearance.

### Owner
- Username: `owner`
- Password: `Owner123!`
- Full appointment access.
- Can edit service names, prices, durations and descriptions.
- Can add services or hide services.
- Can upload the homepage hero background.

**Change both passwords in `.env` before putting the site online.**

## Run in VS Code

1. Open this project folder in VS Code.
2. Open Terminal -> New Terminal.
3. Run:

```bash
npm install
npm start
```

4. Open `http://localhost:3000`.
5. Open `http://localhost:3000/admin.html` for the staff portal.

The existing `data/appointments.db` is retained. On the first start, the server adds the new tables and imports the sample services from `data/services.json` if the services table is empty.

## Important

The website uses the database for services now. After this upgrade, changing `data/services.json` will not overwrite services that are already in the database. Use the Owner dashboard to make changes.

The WhatsApp number remains `+27 68 581 4380`. WhatsApp Cloud API fields are still in `.env`; if they are empty, the booking confirmation provides a WhatsApp link as a fallback.
