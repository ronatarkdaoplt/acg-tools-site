# ACG Tools Site

## Local build steps

1. Build sdk package

   ```bash
   yarn build:packages
   ```

2. Go to `/playground` directory

   ```bash
   cd playground
   ```

3. Create `.env` from `.env.example`.

   For `RPC_PROVIDER_URL_56`, it's recommended to replace the provided rpc with a reliable third-party rpc for a consistent & uninterrupted connection.

   For `WALLETCONNECT_PROJECT_ID`, retrieve the `projectId` from Reown dashboard

   ```bash
   cp .env.example .env
   ```

4. Install required packages

   ```bash
   yarn install
   ```

5. Launch dev app

   ```bash
   yarn dev
   ```
