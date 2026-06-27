import CarPlay
import MapKit
import Combine

/// Owns the CarPlay UI. Renders the latest planned route — polyline + ordered
/// stop annotations — on an `MKMapView` in the CarPlay window, and mirrors the
/// stops in a `CPListTemplate`. When no route exists yet it shows a friendly
/// "plan one on your iPhone" message.
///
/// The route comes from the shared `RouteStore`, which the phone scene updates;
/// we observe it over Combine so the car view stays in sync.
final class CarPlayController: NSObject {
    private let interfaceController: CPInterfaceController
    private let window: CPWindow
    private let mapView = MKMapView()

    private var cancellable: AnyCancellable?

    init(interfaceController: CPInterfaceController, window: CPWindow) {
        self.interfaceController = interfaceController
        self.window = window
        super.init()

        mapView.frame = window.bounds
        mapView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        mapView.delegate = self
        window.rootViewController = MapHostViewController(mapView: mapView)

        let mapTemplate = CPMapTemplate()
        mapTemplate.hidesButtonsWithNavigationBar = false
        interfaceController.setRootTemplate(mapTemplate, animated: false, completion: nil)

        cancellable = RouteStore.shared.$current
            .receive(on: RunLoop.main)
            .sink { [weak self] persisted in
                self?.render(persisted)
            }
    }

    private func render(_ persisted: PersistedPlan?) {
        mapView.removeOverlays(mapView.overlays)
        mapView.removeAnnotations(mapView.annotations)

        guard let persisted else {
            showEmptyState()
            return
        }

        let plan = persisted.plan
        let coordinates = plan.coordinates
        if coordinates.count >= 2 {
            let polyline = MKPolyline(coordinates: coordinates, count: coordinates.count)
            mapView.addOverlay(polyline)
            mapView.setVisibleMapRect(
                polyline.boundingMapRect,
                edgePadding: UIEdgeInsets(top: 40, left: 40, bottom: 40, right: 40),
                animated: true
            )
        }

        mapView.addAnnotation(point(plan.origin.coordinate, title: persisted.originName))
        for stop in plan.stops.sorted(by: { $0.order < $1.order }) {
            mapView.addAnnotation(point(stop.coordinate, title: "\(stop.order). \(stop.name)", subtitle: stop.retailer))
        }
        mapView.addAnnotation(point(plan.destination.coordinate, title: persisted.destinationName))

        showStopList(persisted)
    }

    private func showStopList(_ persisted: PersistedPlan) {
        let items: [CPListItem] = persisted.plan.stops
            .sorted { $0.order < $1.order }
            .map { stop in
                let item = CPListItem(text: stop.name, detailText: stop.retailer)
                item.handler = { [weak self] _, completion in
                    self?.focus(on: stop.coordinate)
                    completion()
                }
                return item
            }

        let section = CPListSection(items: items)
        let list = CPListTemplate(title: "Stops to \(persisted.destinationName)", sections: [section])
        interfaceController.setRootTemplate(list, animated: true, completion: nil)
    }

    private func showEmptyState() {
        let item = CPInformationItem(
            title: "No route yet",
            detail: "Plan a vending-machine route on your iPhone and it will appear here."
        )
        let info = CPInformationTemplate(
            title: "PokéRouter",
            layout: .leading,
            items: [item],
            actions: []
        )
        interfaceController.setRootTemplate(info, animated: true, completion: nil)
    }

    private func focus(on coordinate: CLLocationCoordinate2D) {
        let region = MKCoordinateRegion(center: coordinate, latitudinalMeters: 1500, longitudinalMeters: 1500)
        mapView.setRegion(region, animated: true)
    }

    private func point(_ coordinate: CLLocationCoordinate2D, title: String, subtitle: String? = nil) -> MKPointAnnotation {
        let annotation = MKPointAnnotation()
        annotation.coordinate = coordinate
        annotation.title = title
        annotation.subtitle = subtitle
        return annotation
    }
}

extension CarPlayController: MKMapViewDelegate {
    func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
        guard let polyline = overlay as? MKPolyline else { return MKOverlayRenderer(overlay: overlay) }
        let renderer = MKPolylineRenderer(polyline: polyline)
        renderer.strokeColor = .systemBlue
        renderer.lineWidth = 6
        return renderer
    }
}

/// Minimal view controller so the CarPlay window has a root that fills with our map.
private final class MapHostViewController: UIViewController {
    private let mapView: MKMapView

    init(mapView: MKMapView) {
        self.mapView = mapView
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        mapView.frame = view.bounds
        view.addSubview(mapView)
    }
}
