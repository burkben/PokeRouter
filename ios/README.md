# PokéRouter — iOS + CarPlay (P5)

A native iPhone app and CarPlay scene for PokéRouter. The phone app plans a
vending-machine route against the existing backend and hands it off to Apple
Maps, Google Maps, or a Tesla. The CarPlay scene mirrors the most-recently
planned route on the in-car screen.

> **Status: buildable scaffold + entitlement playbook.** The iPhone app compiles,
> runs, and ships today. The custom CarPlay map scene is **gated by Apple** (see
> [§ CarPlay entitlement](#carplay-entitlement-the-honest-part)). This directory
> delivers the complete, compiling code plus the step-by-step approval path — not
> an App Store submission.

## Layout

```
ios/
  project.yml                     XcodeGen spec (source of truth; .xcodeproj is git-ignored)
  PokeRouter/
    App/AppDelegate.swift         UIKit @main lifecycle + scene routing
    Scenes/
      PhoneSceneDelegate.swift    hosts the SwiftUI UI in the iPhone window
      CarPlaySceneDelegate.swift  CPTemplateApplicationSceneDelegate entry point
    CarPlay/CarPlayController.swift   route polyline + stop list on the car screen
    Models/Models.swift           Codable mirrors of the backend API contract
    Networking/
      APIConfig.swift             base-URL resolution (UserDefaults override)
      PokeRouterAPI.swift         async URLSession client
    State/RouteStore.swift        shared, persisted "current plan" (phone ⇄ CarPlay)
    Location/LocationProvider.swift  CLLocationManager wrapper
    Delivery/RouteDelivery.swift  Apple Maps / Google Maps / Tesla handoff
    Features/
      PlannerView.swift           the single planner screen
      PlannerViewModel.swift      @MainActor state + /plan call
      RouteMapView.swift          SwiftUI Map: polyline + ordered markers
      DestinationSearch.swift     MKLocalSearch (no API key)
    Resources/
      Info.plist                  scene manifest, ATS localhost, location string
      PokeRouter.entitlements      empty by default; CarPlay key documented inline
      Assets.xcassets             app icon + accent color placeholders
  Tests/PokeRouterTests/ModelDecodingTests.swift   pins models to backend JSON
```

## Build & run

Requires Xcode 16+ and [XcodeGen](https://github.com/yonseiman/XcodeGen)
(`brew install xcodegen`).

```sh
cd ios
xcodegen generate          # writes PokeRouter.xcodeproj from project.yml
open PokeRouter.xcodeproj   # ⌘R to run on a simulator
```

Command line (what CI / this repo verified):

```sh
# Build for the simulator without a signing identity:
xcodebuild -scheme PokeRouter -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' build CODE_SIGNING_ALLOWED=NO

# Run the model-decoding tests:
xcodebuild -scheme PokeRouter -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 17' test CODE_SIGNING_ALLOWED=NO
```

> Regenerate the project (`xcodegen generate`) any time you add/rename files or
> edit `project.yml`. The `.xcodeproj` is intentionally **not** committed.

### Point the app at the backend

Start the backend first (from `backend/`): `npm start` → it listens on
`http://localhost:8080`. On the **iOS Simulator**, `localhost` resolves to your
Mac, so it just works. For a **real device** or a deployed backend, override the
base URL (e.g. in a debug build, or via a settings UI you add later):

```swift
UserDefaults.standard.set("http://192.168.1.50:8080", forKey: "apiBaseURL")
```

`Info.plist` enables `NSAllowsLocalNetworking` so plain-HTTP localhost works in
development. For production, serve the backend over HTTPS and drop that key.

## Architecture notes

- **UIKit app lifecycle, SwiftUI content.** `@main AppDelegate` + per-role scene
  delegates give precise control over multi-scene setup. The phone scene hosts
  `PlannerView` via `UIHostingController`; the CarPlay scene is a separate
  template scene. (SwiftUI's `App` lifecycle + CarPlay is fiddly; this is the
  robust path.)
- **One source of truth for the route.** `RouteStore.shared` holds the latest
  plan and persists it to a JSON file in Application Support. The phone writes it
  on every successful `/plan`; the CarPlay controller observes it over Combine,
  so the car screen updates the moment a new route is planned. Phone and CarPlay
  run in the **same process**, so a singleton + file is enough — no App Group.
- **Models mirror the backend exactly.** `Models.swift` is a 1:1 Codable mirror
  of `backend/src/server/app.ts` and `backend/src/share/routes.ts`.
  `ModelDecodingTests` decodes representative JSON for each endpoint so contract
  drift fails a test instead of silently breaking the UI. `routeGeometry` is
  `[[lng, lat]]`; `PlanResult.coordinates` swaps it to `CLLocationCoordinate2D`.
- **Delivery reuses the backend.** Apple Maps opens directly via `MKMapItem`.
  Google Maps and Tesla go through the backend (`/share/links`, `/tesla/*`) so
  link-building and OAuth stay in one place, shared with the web app.

## CarPlay entitlement (the honest part)

**The CarPlay code compiles and links without any entitlement** — the CarPlay
framework is always available. The entitlement only governs **runtime
activation** on a real head unit. So you can develop and review the whole scene
today; it simply won't appear in a car (or the CarPlay Simulator) until Apple
grants the entitlement and you add it to the provisioning profile.

### What Apple requires

1. **Apple Developer Program membership** ($99/yr). Needed for any entitlement,
   TestFlight, or App Store distribution.
2. **Request the CarPlay entitlement** from Apple:
   <https://developer.apple.com/contact/carplay/>. You choose a CarPlay **app
   category**; the relevant one here is **navigation**
   (`com.apple.developer.carplay-maps`). Apple reviews the request manually.
3. On approval, the entitlement appears for your App ID. Add it to
   `PokeRouter.entitlements`:
   ```xml
   <key>com.apple.developer.carplay-maps</key>
   <true/>
   ```
   then regenerate the provisioning profile and rebuild.
4. Test in **Xcode ▸ Open Developer Tool ▸ Simulator**, then **I/O ▸ External
   Displays ▸ CarPlay** (the CarPlay window only appears once the entitlement is
   present).

### The honest caveat

A Pokémon **vending-machine finder is unlikely to be approved** as a CarPlay
*navigation* app — Apple reserves `carplay-maps` for full turn-by-turn nav
apps, and is selective. Plan accordingly:

| Path | Ships today? | In-car? | Notes |
|------|:---:|:---:|-------|
| **Apple Maps handoff** | ✅ | ✅ native | `MKMapItem.openMaps` → Apple Maps drives via CarPlay itself. **The guaranteed in-car route.** |
| **Google Maps deep link** | ✅ | ✅ via Google Maps' own CarPlay | Backend builds the multi-stop link. |
| **Tesla send-to-car** | ✅ | ✅ Tesla nav | Tesla cars don't run CarPlay; this is the Tesla-native path (P4). |
| **Custom CarPlay scene** | code ✅ | ⛔ until approved | This directory's `CarPlay/` scene — the entitlement-gated enhancement. |

**Bottom line:** the in-car experience is fully covered *today* by handing off to
Apple Maps / Google Maps / Tesla. The bundled CarPlay scene is a ready-to-go
upgrade for if/when Apple grants the entitlement — the code is done and waiting.

## Known gaps / TODO

- **Apple Maps multi-stop** is best-effort: `MKMapItem.openMaps` honors the first
  and last stops reliably and intermediate ones where the installed Maps version
  allows. For a long crawl, Google Maps (backend link) is the more dependable
  multi-waypoint path.
- **Live Tesla OAuth on device** would need the backend callback redirected to a
  custom URL scheme (it currently returns to the web app). Mock mode
  (`TESLA_MOCK=1`) works end-to-end today.
- **App icon** is a placeholder (empty `AppIcon.appiconset`) — fine for the
  simulator; add real art before any distribution.
