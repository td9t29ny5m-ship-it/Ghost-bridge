# Ghost Bridge

Mobile-friendly web interface and Bedrock relay project.

## Files included
- `server.js`: web server and relay setup
- `public/index.html`: the provided website interface
- `package.json`: Node.js dependencies and start command

## Important missing file
The supplied `server.js` imports `./ghost` and calls `createGhost()`, but a `ghost.js` file was not present with the two supplied files. The application will not start correctly until the matching `ghost.js` module is added.

## Run
Requires Node.js 20 or newer. Install dependencies with `npm install`, then set `ADMIN_PASSWORD` and run `npm start`. The Bedrock relay also needs a host that supports UDP networking; ordinary static website hosting is not sufficient.
