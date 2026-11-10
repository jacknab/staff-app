// Real alarms for bookings on iOS 26+ (owner, 2026-11-07): AlarmKit rings full-screen on the lock screen, like the
// Clock app, even with the app closed. Every AlarmKit call is behind iOS 26 checks; older iPhones get `false` / no-ops.
import ExpoModulesCore
#if canImport(AlarmKit)
import AlarmKit
import SwiftUI

@available(iOS 26.0, *)
struct CertxaAlarmMeta: AlarmMetadata {}
#endif

public class CertxaAlarmModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CertxaAlarm")

    Function("isAvailable") { () -> Bool in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) { return true }
      #endif
      return false
    }

    AsyncFunction("authorizationState") { () -> String in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) { return Self.stateName(AlarmManager.shared.authorizationState) }
      #endif
      return "unavailable"
    }

    AsyncFunction("requestAuthorization") { () async -> String in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) {
        do { return Self.stateName(try await AlarmManager.shared.requestAuthorization()) } catch { return "denied" }
      }
      #endif
      return "unavailable"
    }

    // An alarm at `timestampMs` titled `title`, ringing `sound` (a file in the app, e.g. reminder.wav). Got it stops it;
    // Snooze rings again in `snoozeSeconds`. If AlarmKit won't take the snooze, it's set with Got it only.
    AsyncFunction("schedule") { (id: String, timestampMs: Double, title: String, sound: String, snoozeSeconds: Double) async -> Bool in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) {
        guard let uuid = UUID(uuidString: id) else { return false }
        let date = Date(timeIntervalSince1970: timestampMs / 1000)
        if (try? await Self.set(uuid: uuid, date: date, title: title, sound: sound, snooze: snoozeSeconds)) != nil { return true }
        return (try? await Self.set(uuid: uuid, date: date, title: title, sound: sound, snooze: 0)) != nil
      }
      #endif
      return false
    }

    AsyncFunction("cancel") { (id: String) in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *), let uuid = UUID(uuidString: id) { try? AlarmManager.shared.cancel(id: uuid) }
      #endif
    }

    AsyncFunction("scheduledIds") { () -> [String] in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) { return ((try? AlarmManager.shared.alarms) ?? []).map { $0.id.uuidString } }
      #endif
      return []
    }
  }

  #if canImport(AlarmKit)
  @available(iOS 26.0, *)
  static func stateName(_ state: AlarmManager.AuthorizationState) -> String {
    switch state {
    case .authorized: return "authorized"
    case .denied: return "denied"
    case .notDetermined: return "notDetermined"
    @unknown default: return "denied"
    }
  }

  @available(iOS 26.0, *)
  static func set(uuid: UUID, date: Date, title: String, sound: String, snooze: Double) async throws {
    let gotIt = AlarmButton(text: "Got it", textColor: .white, systemImageName: "checkmark")
    let alert: AlarmPresentation.Alert
    if snooze > 0 {
      let snoozeButton = AlarmButton(text: "Snooze", textColor: .white, systemImageName: "zzz")
      alert = AlarmPresentation.Alert(title: LocalizedStringResource(stringLiteral: title), stopButton: gotIt,
                                      secondaryButton: snoozeButton, secondaryButtonBehavior: .countdown)
    } else {
      alert = AlarmPresentation.Alert(title: LocalizedStringResource(stringLiteral: title), stopButton: gotIt)
    }
    let attributes = AlarmAttributes<CertxaAlarmMeta>(presentation: AlarmPresentation(alert: alert), tintColor: Color(red: 0.42, green: 0.25, blue: 0.63))
    let configuration = AlarmManager.AlarmConfiguration<CertxaAlarmMeta>(
      countdownDuration: snooze > 0 ? Alarm.CountdownDuration(preAlert: nil, postAlert: snooze) : nil,
      schedule: .fixed(date),
      attributes: attributes,
      sound: .named(sound)
    )
    _ = try await AlarmManager.shared.schedule(id: uuid, configuration: configuration)
  }
  #endif
}
