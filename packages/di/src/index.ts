// Public surface of `@theokit/di`. See README.md for usage examples.

export { Container } from "./container.js";
export { Inject } from "./decorators/inject.js";
export { Injectable, type InjectableOptions } from "./decorators/injectable.js";
export { PostConstruct, PreDestroy } from "./decorators/lifecycle.js";
export { Module, type ModuleMetadata } from "./decorators/module.js";
export { Optional } from "./decorators/optional.js";
export { Primary } from "./decorators/primary.js";
export { Qualifier } from "./decorators/qualifier.js";
export {
  AsyncPostConstructInSyncResolveError,
  AsyncProviderInSyncResolveError,
  ContainerDisposedError,
  ContainerFrozenError,
  CyclicDependencyError,
  describeClassName,
  describeToken,
  MissingInjectableError,
  ReflectMetadataMissingError,
  ScopeViolationError,
  TokenNotFoundError,
} from "./errors.js";
export { METADATA_KEYS } from "./internal/metadata.js";
export {
  CyclicModuleImportError,
  InvalidExportError,
  InvalidModuleError,
} from "./internal/module-loader.js";
export type {
  ClassConstructor,
  ClassProvider,
  ContainerOptions,
  DependencyGraph,
  Disposable,
  ExistingProvider,
  FactoryProvider,
  Provider,
  ResolutionContext,
  Token,
  ValueProvider,
} from "./types.js";
export { Scope } from "./types.js";
