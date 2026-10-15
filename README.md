# Ghost Bridge

Mobile web dashboard and Bedrock relay for viewing schematic guides through a console connection.

## Included
- server.js: dashboard API, authentication and Bedrock relay
- ghost.js: schematic loading and preview controls
- public/index.html: phone-friendly dashboard
- package.json: Node.js dependencies
- deploy/setup-ubuntu.sh: Ubuntu VM setup helper

## Supported schematic files
- Litematica .litematic
- Sponge / MCEdit .schem and .schematic

The preview is visual-only. It does not automatically place blocks or modify the destination server. Schematics are capped at 12,000 non-air blocks to reduce console lag.

## Important hosting requirement
This app needs a persistent Node.js host that supports inbound UDP on port 19134 and TCP on port 3000. Static hosting (including GitHub Pages) cannot run the server or UDP relay. A small Ubuntu VM with UDP firewall access is suitable. Follow deploy/setup-ubuntu.sh, then open TCP 3000 and UDP 19134 in the cloud provider firewall.

## Run
Use Node.js 20 or newer. Run npm install, set a strong ADMIN_PASSWORD, then npm start. Keep the password private. Microsoft/Xbox authentication data is stored in data/host-auth, so use a private trusted host.