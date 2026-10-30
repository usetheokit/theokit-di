/**
 * Base class for every error this package raises.
 *
 * Catch this to handle anything from `@theokit/orm` without naming each subclass, and catch a
 * subclass when the response differs: a configuration fault needs a deploy, a validation fault
 * needs a different call.
 */
export class OrmError extends Error {
  override readonly name: string = "OrmError";
}

/**
 * The wiring is wrong, and no input will make the call succeed.
 *
 * Raised when an entity has no primary key, when `forFeature` runs before `forRoot` for its data
 * source, when `@Transactional` finds no DataSource bound to the instance, when the handle
 * passed as `db` does not expose `transaction()`, or when that handle is a synchronous SQLite
 * driver whose transactions cannot span an `await`. Every case is a mistake in setup rather than in
 * the data, so it fails at the earliest point that can see it rather than at the first query.
 */
export class OrmConfigurationError extends OrmError {
  override readonly name = "OrmConfigurationError";
}

/**
 * A caller-supplied value was rejected at the boundary.
 *
 * The id guards are the reason this exists: `findById`, `update` and `delete` refuse a null, empty
 * or non-scalar id rather than passing it to Drizzle, because a `DELETE` whose `WHERE` matched
 * nothing usable is indistinguishable from one that matched everything until the rows are gone.
 */
export class OrmValidationError extends OrmError {
  override readonly name = "OrmValidationError";
}

/**
 * A table could not be expressed as JSON Schema.
 *
 * Raised by {@link exportSchema} for a column whose type has no mapping. It fails rather than
 * skipping the column: a consumer generating a model in another language would get one missing a
 * field and find out at the first insert.
 */
export class OrmSchemaExportError extends OrmError {
  override readonly name = "OrmSchemaExportError";
}
