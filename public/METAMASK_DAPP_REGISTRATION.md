# MetaMask dApp Registration Files

These files are required for proper deep linking and Universal Links support with MetaMask mobile app.

## Files

### 1. `apple-app-site-association`
- **Purpose**: Enables Universal Links for iOS devices
- **Location**: Should be accessible at `https://yourdomain.com/apple-app-site-association`
- **How it works**: Tells iOS that your domain can deep link to MetaMask app

### 2. `.well-known/assetlinks.json`
- **Purpose**: Enables App Links for Android devices
- **Location**: Should be accessible at `https://yourdomain.com/.well-known/assetlinks.json`
- **How it works**: Tells Android that your domain can deep link to MetaMask app

## After Deployment

### Step 1: Verify Files are Accessible
After deploying, verify these files are accessible:
- `https://testnet.nusarc.xyz/apple-app-site-association`
- `https://testnet.nusarc.xyz/.well-known/assetlinks.json`

Both should return JSON content without any additional headers or authentication.

### Step 2: Register Domain with MetaMask
Submit a PR to the MetaMask mobile repository:

1. Fork the repository: https://github.com/MetaMask/metamask-mobile
2. Edit `develop/src/core/DAppBrowser/DappHostStore.ts`
3. Add your domain to the allowed dApp list
4. Submit a PR with your changes

Reference: https://github.com/MetaMask/metamask-mobile/blob/develop/docs/DEEP_LINKS.md

### Step 3: Test Deep Linking
After registration and deployment, test:
1. Open your site in mobile browser (Chrome/Safari)
2. Click "Connect Wallet" → Select MetaMask
3. Should redirect to MetaMask app with proper session request
4. Approve connection
5. Should return to your site with wallet connected

## Important Notes

- Both files must be served with `Content-Type: application/json`
- No authentication should be required to access these files
- The files must be accessible via HTTPS
- Apple's CDN may cache the `apple-app-site-association` file for up to 24 hours

## Troubleshooting

### iOS Universal Links Not Working
- Verify file is at root domain (not subdirectory)
- Check Content-Type header is `application/json`
- Wait for Apple CDN cache to clear (up to 24 hours)
- Ensure no redirects when accessing the file

### Android App Links Not Working
- Verify file is at `.well-known/assetlinks.json`
- Check SHA256 fingerprint matches MetaMask's release
- Verify domain is properly configured
- Clear app data and retry

## Additional Resources

- MetaMask Deep Links Documentation: https://github.com/MetaMask/metamask-mobile/blob/develop/docs/DEEP_LINKS.md
- Apple Universal Links: https://developer.apple.com/documentation/universal-links
- Android App Links: https://developer.android.com/training/app-links
