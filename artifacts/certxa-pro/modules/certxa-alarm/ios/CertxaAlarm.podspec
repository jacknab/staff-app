Pod::Spec.new do |s|
  s.name           = 'CertxaAlarm'
  s.version        = '1.0.0'
  s.summary        = 'Real alarms for bookings on iOS 26+ (AlarmKit)'
  s.description    = 'Schedules AlarmKit alarms for Certxa Pro bookings; nothing on older iOS.'
  s.author         = 'Certxa'
  s.homepage       = 'https://certxa.com'
  s.license        = { :type => 'Proprietary' }
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  # Weak: the app still opens on iOS 18 and older, where AlarmKit doesn't exist.
  s.weak_frameworks = 'AlarmKit'
  s.source_files = '**/*.swift'
end
