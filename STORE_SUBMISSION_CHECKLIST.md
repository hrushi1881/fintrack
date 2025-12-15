# Store Submission Checklist

## ✅ Completed Configuration

### App Configuration (app.json)
- ✅ App name: "FinTrack"
- ✅ Bundle identifier (iOS): `com.fintrack.app`
- ✅ Package name (Android): `com.fintrack.app`
- ✅ Version: 1.0.0
- ✅ Build number/version code: 1
- ✅ App description added
- ✅ Privacy policy URL placeholder added
- ✅ EAS project ID placeholder added

### EAS Build Configuration (eas.json)
- ✅ Production build configuration
- ✅ Auto-increment version codes
- ✅ Proper build types (app-bundle for Android)

## ⚠️ REQUIRED: Action Items Before Submission

### 1. Privacy Policy (CRITICAL - Required by Both Stores)
**Status:** ⚠️ Placeholder URL - MUST UPDATE
**Current:** `https://your-privacy-policy-url.com/privacy` (placeholder)
**Action Required:**
- Create a privacy policy page (host on your website or use a service like GitHub Pages)
- Update `app.json` → `privacyPolicy` field with your actual URL
- Privacy policy must include:
  - What data you collect (user accounts, financial transactions, etc.)
  - How you use the data (app functionality, analytics)
  - Data storage and security (Supabase hosting, encryption)
  - Third-party services (Supabase, any analytics tools)
  - User rights (GDPR compliance if applicable, data deletion)
  - Contact information for privacy inquiries
  - Cookie policy (if applicable)

### 2. EAS Project Setup
**Status:** ⚠️ Needs Configuration
**Action Required:**
1. Run: `npx eas login` (if not logged in)
2. Run: `npx eas init` to create EAS project
3. Update `app.json` → `extra.eas.projectId` with your actual project ID
4. Update `app.json` → `owner` with your Expo username

### 3. App Store Connect (iOS)
**Status:** ⚠️ Needs Setup
**Action Required:**
1. Create app in App Store Connect:
   - App name: FinTrack
   - Bundle ID: com.fintrack.app
   - Primary language: English
   - SKU: fintrack-app
2. Complete App Information:
   - Category: Finance
   - Subcategory: Budgeting
   - Age rating: 4+ (or appropriate)
   - Privacy policy URL (required)
   - Support URL
   - Marketing URL (optional)
3. Complete Pricing and Availability
4. Add app description, keywords, screenshots
5. Prepare app preview video (optional but recommended)

### 4. Google Play Console (Android)
**Status:** ⚠️ Needs Setup
**Action Required:**
1. Create app in Google Play Console:
   - App name: FinTrack
   - Default language: English
   - App or game: App
   - Free or paid: Free
2. Complete Store listing:
   - App description (short and full)
   - Graphic assets (icon, screenshots, feature graphic)
   - Category: Finance
   - Content rating questionnaire
   - Privacy policy URL (required)
   - Target audience
3. Complete Content rating
4. Set up Data safety section:
   - Data collection practices
   - Data sharing practices
   - Security practices

### 5. App Assets Required
**Status:** ⚠️ Check Required
**Required Assets:**
- [ ] App icon (1024x1024px for iOS, various sizes for Android)
- [ ] Screenshots:
  - iOS: 6.5" iPhone (1290x2796px) - at least 3 required
  - iOS: 12.9" iPad (2048x2732px) - at least 3 required
  - Android: Phone (1080x1920px) - at least 2 required
  - Android: Tablet (1200x1920px) - at least 2 required
- [ ] Feature graphic (Android): 1024x500px
- [ ] App preview video (optional but recommended)

### 6. Bundle Identifiers
**Status:** ✅ Configured
**Note:** Ensure these match your developer accounts:
- iOS: `com.fintrack.app` (must match Apple Developer account)
- Android: `com.fintrack.app` (must be unique, reverse domain format)

### 7. Version Management
**Status:** ✅ Configured
- Version: 1.0.0
- iOS Build Number: 1 (will auto-increment)
- Android Version Code: 1 (will auto-increment)

### 8. Permissions
**Status:** ✅ Minimal Permissions
**Current:** No sensitive permissions required
**Note:** If you add features later (camera, location, etc.), update permissions and add usage descriptions

### 9. Build Commands
**To build for production:**
```bash
# iOS
npx eas build --platform ios --profile production

# Android
npx eas build --platform android --profile production

# Both
npx eas build --platform all --profile production
```

### 10. Submission Commands
**After building:**
```bash
# iOS (requires App Store Connect setup)
npx eas submit --platform ios --profile production

# Android (requires Google Play Console setup)
npx eas submit --platform android --profile production
```

## 🔍 Pre-Submission Testing Checklist

- [ ] Test app on physical iOS device
- [ ] Test app on physical Android device
- [ ] Test all core features work correctly
- [ ] Test app with no internet connection (graceful degradation)
- [ ] Test app with slow internet connection
- [ ] Verify no console errors in production build
- [ ] Verify no test/development content visible
- [ ] Test app with different screen sizes
- [ ] Test app in both light and dark mode
- [ ] Verify all navigation works correctly
- [ ] Test authentication flow
- [ ] Test data persistence
- [ ] Verify privacy policy link works

## 📋 Store-Specific Requirements

### iOS App Store
- [ ] App complies with App Store Review Guidelines
- [ ] No placeholder content
- [ ] Proper age rating
- [ ] Privacy policy accessible
- [ ] Support contact information
- [ ] App description and keywords optimized
- [ ] Screenshots show actual app functionality
- [ ] App preview video (optional)

### Google Play Store
- [ ] App complies with Google Play Developer Policy
- [ ] Content rating completed
- [ ] Data safety section completed
- [ ] Privacy policy accessible
- [ ] Target audience defined
- [ ] App description optimized
- [ ] Feature graphic and screenshots
- [ ] Store listing complete

## 🚨 Common Rejection Reasons to Avoid

1. **Privacy Policy Missing** - Both stores require this
2. **Placeholder Content** - Remove all "your-project-id", "your-expo-username" placeholders
3. **Incomplete App** - Ensure all features work
4. **Crash on Launch** - Test thoroughly before submission
5. **Missing Permissions Descriptions** - If you add permissions, add descriptions
6. **Inappropriate Content** - Ensure content is appropriate
7. **Misleading Metadata** - Ensure descriptions match app functionality
8. **Missing Support Information** - Add support email/URL

## 📝 Next Steps

1. **Create Privacy Policy** (URGENT)
2. **Set up EAS project** (`npx eas init`)
3. **Create store listings** (App Store Connect & Google Play Console)
4. **Prepare app assets** (screenshots, icons, etc.)
5. **Build production versions** (`npx eas build`)
6. **Test production builds** thoroughly
7. **Submit to stores** (`npx eas submit`)

## 🔗 Useful Resources

- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [EAS Submit Documentation](https://docs.expo.dev/submit/introduction/)
- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Google Play Developer Policy](https://play.google.com/about/developer-content-policy/)
