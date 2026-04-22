export * from './android-detector.js';
export * from './cocoapods-detector.js';
export * from './database-detector.js';
export * from './detector.js';
export * from './docker-detector.js';
export * from './dotnet-detector.js';
export * from './flutter-detector.js';
export * from './go-detector.js';
export * from './ide-detector.js';
export * from './java-gradle-detector.js';
export * from './java-maven-detector.js';
export * from './node-detector.js';
export * from './python-detector.js';
export * from './ruby-detector.js';
export * from './rust-detector.js';
export * from './system-detector.js';
export * from './webserver-detector.js';
export * from './xcode-detector.js';

import { AndroidDetector } from './android-detector.js';
import { CocoaPodsDetector } from './cocoapods-detector.js';
import { DatabaseDetector } from './database-detector.js';
import type { ProjectDetector } from './detector.js';
import { DockerDetector } from './docker-detector.js';
import { DotnetDetector } from './dotnet-detector.js';
import { FlutterDetector } from './flutter-detector.js';
import { GoDetector } from './go-detector.js';
import { IdeDetector } from './ide-detector.js';
import { JavaGradleDetector } from './java-gradle-detector.js';
import { JavaMavenDetector } from './java-maven-detector.js';
import { NodeDetector } from './node-detector.js';
import { PythonDetector } from './python-detector.js';
import { RubyDetector } from './ruby-detector.js';
import { RustDetector } from './rust-detector.js';
import { SystemDetector } from './system-detector.js';
import { WebserverDetector } from './webserver-detector.js';
import { XcodeDetector } from './xcode-detector.js';

/**
 * Canonical detector set used by Scanner across CLI (`scan`, `clean`),
 * MCP server, and agent. Single source of truth — when adding a new
 * detector, register it here and every consumer picks it up.
 *
 * Bug #9 (dogfood beta.7): CLI `clean` and agent `tool-executor` had
 * hand-rolled lists missing 8 detectors that `scan` knew about, so users
 * saw items in `scan` they couldn't act on in `clean`.
 *
 * Returns fresh instances per call — detectors carry no shared state but
 * may hold per-instance options injected by tests.
 */
export function defaultDetectors(): ProjectDetector[] {
  return [
    new NodeDetector(),
    new PythonDetector(),
    new RustDetector(),
    new GoDetector(),
    new JavaMavenDetector(),
    new JavaGradleDetector(),
    new RubyDetector(),
    new DotnetDetector(),
    new DockerDetector(),
    new XcodeDetector(),
    new FlutterDetector(),
    new AndroidDetector(),
    new CocoaPodsDetector(),
    new IdeDetector(),
    new SystemDetector(),
    new WebserverDetector(),
    new DatabaseDetector(),
  ];
}
