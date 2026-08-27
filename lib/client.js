window.__ModuleLoader__.load({
  id: "@wolffycode/dsh-engine-suite",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
let react = require("react");
let react_jsx_runtime = require("react/jsx-runtime");
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/core.js
var _a$1;
function $constructor(name, initializer, params) {
	function init(inst, def) {
		if (!inst._zod) Object.defineProperty(inst, "_zod", {
			value: {
				def,
				constr: _,
				traits: /* @__PURE__ */ new Set()
			},
			enumerable: false
		});
		if (inst._zod.traits.has(name)) return;
		inst._zod.traits.add(name);
		initializer(inst, def);
		const proto = _.prototype;
		const keys = Object.keys(proto);
		for (let i = 0; i < keys.length; i++) {
			const k = keys[i];
			if (!(k in inst)) inst[k] = proto[k].bind(inst);
		}
	}
	const Parent = params?.Parent ?? Object;
	class Definition extends Parent {}
	Object.defineProperty(Definition, "name", { value: name });
	function _(def) {
		var _a;
		const inst = params?.Parent ? new Definition() : this;
		init(inst, def);
		(_a = inst._zod).deferred ?? (_a.deferred = []);
		for (const fn of inst._zod.deferred) fn();
		return inst;
	}
	Object.defineProperty(_, "init", { value: init });
	Object.defineProperty(_, Symbol.hasInstance, { value: (inst) => {
		if (params?.Parent && inst instanceof params.Parent) return true;
		return inst?._zod?.traits?.has(name);
	} });
	Object.defineProperty(_, "name", { value: name });
	return _;
}
var $ZodAsyncError = class extends Error {
	constructor() {
		super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
	}
};
var $ZodEncodeError = class extends Error {
	constructor(name) {
		super(`Encountered unidirectional transform during encode: ${name}`);
		this.name = "ZodEncodeError";
	}
};
(_a$1 = globalThis).__zod_globalConfig ?? (_a$1.__zod_globalConfig = {});
const globalConfig = globalThis.__zod_globalConfig;
function config(newConfig) {
	if (newConfig) Object.assign(globalConfig, newConfig);
	return globalConfig;
}
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/util.js
function getEnumValues(entries) {
	const numericValues = Object.values(entries).filter((v) => typeof v === "number");
	return Object.entries(entries).filter(([k, _]) => numericValues.indexOf(+k) === -1).map(([_, v]) => v);
}
function jsonStringifyReplacer(_, value) {
	if (typeof value === "bigint") return value.toString();
	return value;
}
function cached(getter) {
	return { get value() {
		{
			const value = getter();
			Object.defineProperty(this, "value", { value });
			return value;
		}
	} };
}
function nullish(input) {
	return input === null || input === void 0;
}
function cleanRegex(source) {
	const start = source.startsWith("^") ? 1 : 0;
	const end = source.endsWith("$") ? source.length - 1 : source.length;
	return source.slice(start, end);
}
function floatSafeRemainder(val, step) {
	const ratio = val / step;
	const roundedRatio = Math.round(ratio);
	const tolerance = Number.EPSILON * Math.max(Math.abs(ratio), 1);
	if (Math.abs(ratio - roundedRatio) < tolerance) return 0;
	return ratio - roundedRatio;
}
const EVALUATING = /* @__PURE__*/ Symbol("evaluating");
function defineLazy(object, key, getter) {
	let value = void 0;
	Object.defineProperty(object, key, {
		get() {
			if (value === EVALUATING) return;
			if (value === void 0) {
				value = EVALUATING;
				value = getter();
			}
			return value;
		},
		set(v) {
			Object.defineProperty(object, key, { value: v });
		},
		configurable: true
	});
}
function assignProp(target, prop, value) {
	Object.defineProperty(target, prop, {
		value,
		writable: true,
		enumerable: true,
		configurable: true
	});
}
function mergeDefs(...defs) {
	const mergedDescriptors = {};
	for (const def of defs) {
		const descriptors = Object.getOwnPropertyDescriptors(def);
		Object.assign(mergedDescriptors, descriptors);
	}
	return Object.defineProperties({}, mergedDescriptors);
}
function esc(str) {
	return JSON.stringify(str);
}
function slugify(input) {
	return input.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
}
const captureStackTrace = "captureStackTrace" in Error ? Error.captureStackTrace : (..._args) => {};
function isObject(data) {
	return typeof data === "object" && data !== null && !Array.isArray(data);
}
const allowsEval = /* @__PURE__*/ cached(() => {
	if (globalConfig.jitless) return false;
	if (typeof navigator !== "undefined" && navigator?.userAgent?.includes("Cloudflare")) return false;
	try {
		new Function("");
		return true;
	} catch (_) {
		return false;
	}
});
function isPlainObject(o) {
	if (isObject(o) === false) return false;
	const ctor = o.constructor;
	if (ctor === void 0) return true;
	if (typeof ctor !== "function") return true;
	const prot = ctor.prototype;
	if (isObject(prot) === false) return false;
	if (Object.prototype.hasOwnProperty.call(prot, "isPrototypeOf") === false) return false;
	return true;
}
function shallowClone(o) {
	if (isPlainObject(o)) return { ...o };
	if (Array.isArray(o)) return [...o];
	if (o instanceof Map) return new Map(o);
	if (o instanceof Set) return new Set(o);
	return o;
}
const propertyKeyTypes = /* @__PURE__*/ new Set([
	"string",
	"number",
	"symbol"
]);
function escapeRegex(str) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function clone(inst, def, params) {
	const cl = new inst._zod.constr(def ?? inst._zod.def);
	if (!def || params?.parent) cl._zod.parent = inst;
	return cl;
}
function normalizeParams(_params) {
	const params = _params;
	if (!params) return {};
	if (typeof params === "string") return { error: () => params };
	if (params?.message !== void 0) {
		if (params?.error !== void 0) throw new Error("Cannot specify both `message` and `error` params");
		params.error = params.message;
	}
	delete params.message;
	if (typeof params.error === "string") return {
		...params,
		error: () => params.error
	};
	return params;
}
function optionalKeys(shape) {
	return Object.keys(shape).filter((k) => {
		return shape[k]._zod.optin === "optional" && shape[k]._zod.optout === "optional";
	});
}
const NUMBER_FORMAT_RANGES = {
	safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
	int32: [-2147483648, 2147483647],
	uint32: [0, 4294967295],
	float32: [-34028234663852886e22, 34028234663852886e22],
	float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
};
function pick(schema, mask) {
	const currDef = schema._zod.def;
	const checks = currDef.checks;
	if (checks && checks.length > 0) throw new Error(".pick() cannot be used on object schemas containing refinements");
	return clone(schema, mergeDefs(schema._zod.def, {
		get shape() {
			const newShape = {};
			for (const key in mask) {
				if (!(key in currDef.shape)) throw new Error(`Unrecognized key: "${key}"`);
				if (!mask[key]) continue;
				newShape[key] = currDef.shape[key];
			}
			assignProp(this, "shape", newShape);
			return newShape;
		},
		checks: []
	}));
}
function omit(schema, mask) {
	const currDef = schema._zod.def;
	const checks = currDef.checks;
	if (checks && checks.length > 0) throw new Error(".omit() cannot be used on object schemas containing refinements");
	return clone(schema, mergeDefs(schema._zod.def, {
		get shape() {
			const newShape = { ...schema._zod.def.shape };
			for (const key in mask) {
				if (!(key in currDef.shape)) throw new Error(`Unrecognized key: "${key}"`);
				if (!mask[key]) continue;
				delete newShape[key];
			}
			assignProp(this, "shape", newShape);
			return newShape;
		},
		checks: []
	}));
}
function extend(schema, shape) {
	if (!isPlainObject(shape)) throw new Error("Invalid input to extend: expected a plain object");
	const checks = schema._zod.def.checks;
	if (checks && checks.length > 0) {
		const existingShape = schema._zod.def.shape;
		for (const key in shape) if (Object.getOwnPropertyDescriptor(existingShape, key) !== void 0) throw new Error("Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.");
	}
	return clone(schema, mergeDefs(schema._zod.def, { get shape() {
		const _shape = {
			...schema._zod.def.shape,
			...shape
		};
		assignProp(this, "shape", _shape);
		return _shape;
	} }));
}
function safeExtend(schema, shape) {
	if (!isPlainObject(shape)) throw new Error("Invalid input to safeExtend: expected a plain object");
	return clone(schema, mergeDefs(schema._zod.def, { get shape() {
		const _shape = {
			...schema._zod.def.shape,
			...shape
		};
		assignProp(this, "shape", _shape);
		return _shape;
	} }));
}
function merge(a, b) {
	if (a._zod.def.checks?.length) throw new Error(".merge() cannot be used on object schemas containing refinements. Use .safeExtend() instead.");
	return clone(a, mergeDefs(a._zod.def, {
		get shape() {
			const _shape = {
				...a._zod.def.shape,
				...b._zod.def.shape
			};
			assignProp(this, "shape", _shape);
			return _shape;
		},
		get catchall() {
			return b._zod.def.catchall;
		},
		checks: b._zod.def.checks ?? []
	}));
}
function partial(Class, schema, mask) {
	const checks = schema._zod.def.checks;
	if (checks && checks.length > 0) throw new Error(".partial() cannot be used on object schemas containing refinements");
	return clone(schema, mergeDefs(schema._zod.def, {
		get shape() {
			const oldShape = schema._zod.def.shape;
			const shape = { ...oldShape };
			if (mask) for (const key in mask) {
				if (!(key in oldShape)) throw new Error(`Unrecognized key: "${key}"`);
				if (!mask[key]) continue;
				shape[key] = Class ? new Class({
					type: "optional",
					innerType: oldShape[key]
				}) : oldShape[key];
			}
			else for (const key in oldShape) shape[key] = Class ? new Class({
				type: "optional",
				innerType: oldShape[key]
			}) : oldShape[key];
			assignProp(this, "shape", shape);
			return shape;
		},
		checks: []
	}));
}
function required(Class, schema, mask) {
	return clone(schema, mergeDefs(schema._zod.def, { get shape() {
		const oldShape = schema._zod.def.shape;
		const shape = { ...oldShape };
		if (mask) for (const key in mask) {
			if (!(key in shape)) throw new Error(`Unrecognized key: "${key}"`);
			if (!mask[key]) continue;
			shape[key] = new Class({
				type: "nonoptional",
				innerType: oldShape[key]
			});
		}
		else for (const key in oldShape) shape[key] = new Class({
			type: "nonoptional",
			innerType: oldShape[key]
		});
		assignProp(this, "shape", shape);
		return shape;
	} }));
}
function aborted(x, startIndex = 0) {
	if (x.aborted === true) return true;
	for (let i = startIndex; i < x.issues.length; i++) if (x.issues[i]?.continue !== true) return true;
	return false;
}
function explicitlyAborted(x, startIndex = 0) {
	if (x.aborted === true) return true;
	for (let i = startIndex; i < x.issues.length; i++) if (x.issues[i]?.continue === false) return true;
	return false;
}
function prefixIssues(path, issues) {
	return issues.map((iss) => {
		var _a;
		(_a = iss).path ?? (_a.path = []);
		iss.path.unshift(path);
		return iss;
	});
}
function unwrapMessage(message) {
	return typeof message === "string" ? message : message?.message;
}
function finalizeIssue(iss, ctx, config) {
	const message = iss.message ? iss.message : unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ?? unwrapMessage(ctx?.error?.(iss)) ?? unwrapMessage(config.customError?.(iss)) ?? unwrapMessage(config.localeError?.(iss)) ?? "Invalid input";
	const { inst: _inst, continue: _continue, input: _input, ...rest } = iss;
	rest.path ?? (rest.path = []);
	rest.message = message;
	if (ctx?.reportInput) rest.input = _input;
	return rest;
}
function getLengthableOrigin(input) {
	if (Array.isArray(input)) return "array";
	if (typeof input === "string") return "string";
	return "unknown";
}
function issue(...args) {
	const [iss, input, inst] = args;
	if (typeof iss === "string") return {
		message: iss,
		code: "custom",
		input,
		inst
	};
	return { ...iss };
}
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/errors.js
const initializer$1 = (inst, def) => {
	inst.name = "$ZodError";
	Object.defineProperty(inst, "_zod", {
		value: inst._zod,
		enumerable: false
	});
	Object.defineProperty(inst, "issues", {
		value: def,
		enumerable: false
	});
	inst.message = JSON.stringify(def, jsonStringifyReplacer, 2);
	Object.defineProperty(inst, "toString", {
		value: () => inst.message,
		enumerable: false
	});
};
const $ZodError = $constructor("$ZodError", initializer$1);
const $ZodRealError = $constructor("$ZodError", initializer$1, { Parent: Error });
function flattenError(error, mapper = (issue) => issue.message) {
	const fieldErrors = {};
	const formErrors = [];
	for (const sub of error.issues) if (sub.path.length > 0) {
		fieldErrors[sub.path[0]] = fieldErrors[sub.path[0]] || [];
		fieldErrors[sub.path[0]].push(mapper(sub));
	} else formErrors.push(mapper(sub));
	return {
		formErrors,
		fieldErrors
	};
}
function formatError(error, mapper = (issue) => issue.message) {
	const fieldErrors = { _errors: [] };
	const processError = (error, path = []) => {
		for (const issue of error.issues) if (issue.code === "invalid_union" && issue.errors.length) issue.errors.map((issues) => processError({ issues }, [...path, ...issue.path]));
		else if (issue.code === "invalid_key") processError({ issues: issue.issues }, [...path, ...issue.path]);
		else if (issue.code === "invalid_element") processError({ issues: issue.issues }, [...path, ...issue.path]);
		else {
			const fullpath = [...path, ...issue.path];
			if (fullpath.length === 0) fieldErrors._errors.push(mapper(issue));
			else {
				let curr = fieldErrors;
				let i = 0;
				while (i < fullpath.length) {
					const el = fullpath[i];
					if (!(i === fullpath.length - 1)) curr[el] = curr[el] || { _errors: [] };
					else {
						curr[el] = curr[el] || { _errors: [] };
						curr[el]._errors.push(mapper(issue));
					}
					curr = curr[el];
					i++;
				}
			}
		}
	};
	processError(error);
	return fieldErrors;
}
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/parse.js
const _parse = (_Err) => (schema, value, _ctx, _params) => {
	const ctx = _ctx ? {
		..._ctx,
		async: false
	} : { async: false };
	const result = schema._zod.run({
		value,
		issues: []
	}, ctx);
	if (result instanceof Promise) throw new $ZodAsyncError();
	if (result.issues.length) {
		const e = new ((_params?.Err) ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
		captureStackTrace(e, _params?.callee);
		throw e;
	}
	return result.value;
};
const _parseAsync = (_Err) => async (schema, value, _ctx, params) => {
	const ctx = _ctx ? {
		..._ctx,
		async: true
	} : { async: true };
	let result = schema._zod.run({
		value,
		issues: []
	}, ctx);
	if (result instanceof Promise) result = await result;
	if (result.issues.length) {
		const e = new ((params?.Err) ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
		captureStackTrace(e, params?.callee);
		throw e;
	}
	return result.value;
};
const _safeParse = (_Err) => (schema, value, _ctx) => {
	const ctx = _ctx ? {
		..._ctx,
		async: false
	} : { async: false };
	const result = schema._zod.run({
		value,
		issues: []
	}, ctx);
	if (result instanceof Promise) throw new $ZodAsyncError();
	return result.issues.length ? {
		success: false,
		error: new (_Err ?? $ZodError)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
	} : {
		success: true,
		data: result.value
	};
};
const safeParse$1 = /* @__PURE__*/ _safeParse($ZodRealError);
const _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
	const ctx = _ctx ? {
		..._ctx,
		async: true
	} : { async: true };
	let result = schema._zod.run({
		value,
		issues: []
	}, ctx);
	if (result instanceof Promise) result = await result;
	return result.issues.length ? {
		success: false,
		error: new _Err(result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
	} : {
		success: true,
		data: result.value
	};
};
const safeParseAsync$1 = /* @__PURE__*/ _safeParseAsync($ZodRealError);
const _encode = (_Err) => (schema, value, _ctx) => {
	const ctx = _ctx ? {
		..._ctx,
		direction: "backward"
	} : { direction: "backward" };
	return _parse(_Err)(schema, value, ctx);
};
const _decode = (_Err) => (schema, value, _ctx) => {
	return _parse(_Err)(schema, value, _ctx);
};
const _encodeAsync = (_Err) => async (schema, value, _ctx) => {
	const ctx = _ctx ? {
		..._ctx,
		direction: "backward"
	} : { direction: "backward" };
	return _parseAsync(_Err)(schema, value, ctx);
};
const _decodeAsync = (_Err) => async (schema, value, _ctx) => {
	return _parseAsync(_Err)(schema, value, _ctx);
};
const _safeEncode = (_Err) => (schema, value, _ctx) => {
	const ctx = _ctx ? {
		..._ctx,
		direction: "backward"
	} : { direction: "backward" };
	return _safeParse(_Err)(schema, value, ctx);
};
const _safeDecode = (_Err) => (schema, value, _ctx) => {
	return _safeParse(_Err)(schema, value, _ctx);
};
const _safeEncodeAsync = (_Err) => async (schema, value, _ctx) => {
	const ctx = _ctx ? {
		..._ctx,
		direction: "backward"
	} : { direction: "backward" };
	return _safeParseAsync(_Err)(schema, value, ctx);
};
const _safeDecodeAsync = (_Err) => async (schema, value, _ctx) => {
	return _safeParseAsync(_Err)(schema, value, _ctx);
};
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/regexes.js
/**
* @deprecated CUID v1 is deprecated by its authors due to information leakage
* (timestamps embedded in the id). Use {@link cuid2} instead.
* See https://github.com/paralleldrive/cuid.
*/
const cuid = /^[cC][0-9a-z]{6,}$/;
const cuid2 = /^[0-9a-z]+$/;
const ulid = /^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$/;
const xid = /^[0-9a-vA-V]{20}$/;
const ksuid = /^[A-Za-z0-9]{27}$/;
const nanoid = /^[a-zA-Z0-9_-]{21}$/;
/** ISO 8601-1 duration regex. Does not support the 8601-2 extensions like negative durations or fractional/negative components. */
const duration$1 = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/;
/** A regex for any UUID-like identifier: 8-4-4-4-12 hex pattern */
const guid = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
/** Returns a regex for validating an RFC 9562/4122 UUID.
*
* @param version Optionally specify a version 1-8. If no version is specified, all versions are supported. */
const uuid = (version) => {
	if (!version) return /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;
	return new RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${version}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`);
};
/** Practical email validation */
const email = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
const _emoji$1 = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
function emoji() {
	return new RegExp(_emoji$1, "u");
}
const ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
const ipv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;
const cidrv4 = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/;
const cidrv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::|([0-9a-fA-F]{1,4})?::([0-9a-fA-F]{1,4}:?){0,6})\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
const base64 = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/;
const base64url = /^[A-Za-z0-9_-]*$/;
const httpProtocol = /^https?$/;
const e164 = /^\+[1-9]\d{6,14}$/;
const dateSource = `(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))`;
const date$1 = /*@__PURE__*/ new RegExp(`^${dateSource}$`);
function timeSource(args) {
	const hhmm = `(?:[01]\\d|2[0-3]):[0-5]\\d`;
	return typeof args.precision === "number" ? args.precision === -1 ? `${hhmm}` : args.precision === 0 ? `${hhmm}:[0-5]\\d` : `${hhmm}:[0-5]\\d\\.\\d{${args.precision}}` : `${hhmm}(?::[0-5]\\d(?:\\.\\d+)?)?`;
}
function time$1(args) {
	return new RegExp(`^${timeSource(args)}$`);
}
function datetime$1(args) {
	const time = timeSource({ precision: args.precision });
	const opts = ["Z"];
	if (args.local) opts.push("");
	if (args.offset) opts.push(`([+-](?:[01]\\d|2[0-3]):[0-5]\\d)`);
	const timeRegex = `${time}(?:${opts.join("|")})`;
	return new RegExp(`^${dateSource}T(?:${timeRegex})$`);
}
const string$1 = (params) => {
	const regex = params ? `[\\s\\S]{${params?.minimum ?? 0},${params?.maximum ?? ""}}` : `[\\s\\S]*`;
	return new RegExp(`^${regex}$`);
};
const integer = /^-?\d+$/;
const number$1 = /^-?\d+(?:\.\d+)?$/;
const boolean$1 = /^(?:true|false)$/i;
const _undefined$2 = /^undefined$/i;
const lowercase = /^[^A-Z]*$/;
const uppercase = /^[^a-z]*$/;
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/checks.js
const $ZodCheck = /*@__PURE__*/ $constructor("$ZodCheck", (inst, def) => {
	var _a;
	inst._zod ?? (inst._zod = {});
	inst._zod.def = def;
	(_a = inst._zod).onattach ?? (_a.onattach = []);
});
const numericOriginMap = {
	number: "number",
	bigint: "bigint",
	object: "date"
};
const $ZodCheckLessThan = /*@__PURE__*/ $constructor("$ZodCheckLessThan", (inst, def) => {
	$ZodCheck.init(inst, def);
	const origin = numericOriginMap[typeof def.value];
	inst._zod.onattach.push((inst) => {
		const bag = inst._zod.bag;
		const curr = (def.inclusive ? bag.maximum : bag.exclusiveMaximum) ?? Number.POSITIVE_INFINITY;
		if (def.value < curr) {
			if (def.inclusive) bag.maximum = def.value;
			else bag.exclusiveMaximum = def.value;
		}
	});
	inst._zod.check = (payload) => {
		if (def.inclusive ? payload.value <= def.value : payload.value < def.value) return;
		payload.issues.push({
			origin,
			code: "too_big",
			maximum: typeof def.value === "object" ? def.value.getTime() : def.value,
			input: payload.value,
			inclusive: def.inclusive,
			inst,
			continue: !def.abort
		});
	};
});
const $ZodCheckGreaterThan = /*@__PURE__*/ $constructor("$ZodCheckGreaterThan", (inst, def) => {
	$ZodCheck.init(inst, def);
	const origin = numericOriginMap[typeof def.value];
	inst._zod.onattach.push((inst) => {
		const bag = inst._zod.bag;
		const curr = (def.inclusive ? bag.minimum : bag.exclusiveMinimum) ?? Number.NEGATIVE_INFINITY;
		if (def.value > curr) {
			if (def.inclusive) bag.minimum = def.value;
			else bag.exclusiveMinimum = def.value;
		}
	});
	inst._zod.check = (payload) => {
		if (def.inclusive ? payload.value >= def.value : payload.value > def.value) return;
		payload.issues.push({
			origin,
			code: "too_small",
			minimum: typeof def.value === "object" ? def.value.getTime() : def.value,
			input: payload.value,
			inclusive: def.inclusive,
			inst,
			continue: !def.abort
		});
	};
});
const $ZodCheckMultipleOf = /*@__PURE__*/ $constructor("$ZodCheckMultipleOf", (inst, def) => {
	$ZodCheck.init(inst, def);
	inst._zod.onattach.push((inst) => {
		var _a;
		(_a = inst._zod.bag).multipleOf ?? (_a.multipleOf = def.value);
	});
	inst._zod.check = (payload) => {
		if (typeof payload.value !== typeof def.value) throw new Error("Cannot mix number and bigint in multiple_of check.");
		if (typeof payload.value === "bigint" ? payload.value % def.value === BigInt(0) : floatSafeRemainder(payload.value, def.value) === 0) return;
		payload.issues.push({
			origin: typeof payload.value,
			code: "not_multiple_of",
			divisor: def.value,
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
const $ZodCheckNumberFormat = /*@__PURE__*/ $constructor("$ZodCheckNumberFormat", (inst, def) => {
	$ZodCheck.init(inst, def);
	def.format = def.format || "float64";
	const isInt = def.format?.includes("int");
	const origin = isInt ? "int" : "number";
	const [minimum, maximum] = NUMBER_FORMAT_RANGES[def.format];
	inst._zod.onattach.push((inst) => {
		const bag = inst._zod.bag;
		bag.format = def.format;
		bag.minimum = minimum;
		bag.maximum = maximum;
		if (isInt) bag.pattern = integer;
	});
	inst._zod.check = (payload) => {
		const input = payload.value;
		if (isInt) {
			if (!Number.isInteger(input)) {
				payload.issues.push({
					expected: origin,
					format: def.format,
					code: "invalid_type",
					continue: false,
					input,
					inst
				});
				return;
			}
			if (!Number.isSafeInteger(input)) {
				if (input > 0) payload.issues.push({
					input,
					code: "too_big",
					maximum: Number.MAX_SAFE_INTEGER,
					note: "Integers must be within the safe integer range.",
					inst,
					origin,
					inclusive: true,
					continue: !def.abort
				});
				else payload.issues.push({
					input,
					code: "too_small",
					minimum: Number.MIN_SAFE_INTEGER,
					note: "Integers must be within the safe integer range.",
					inst,
					origin,
					inclusive: true,
					continue: !def.abort
				});
				return;
			}
		}
		if (input < minimum) payload.issues.push({
			origin: "number",
			input,
			code: "too_small",
			minimum,
			inclusive: true,
			inst,
			continue: !def.abort
		});
		if (input > maximum) payload.issues.push({
			origin: "number",
			input,
			code: "too_big",
			maximum,
			inclusive: true,
			inst,
			continue: !def.abort
		});
	};
});
const $ZodCheckMaxLength = /*@__PURE__*/ $constructor("$ZodCheckMaxLength", (inst, def) => {
	var _a;
	$ZodCheck.init(inst, def);
	(_a = inst._zod.def).when ?? (_a.when = (payload) => {
		const val = payload.value;
		return !nullish(val) && val.length !== void 0;
	});
	inst._zod.onattach.push((inst) => {
		const curr = inst._zod.bag.maximum ?? Number.POSITIVE_INFINITY;
		if (def.maximum < curr) inst._zod.bag.maximum = def.maximum;
	});
	inst._zod.check = (payload) => {
		const input = payload.value;
		if (input.length <= def.maximum) return;
		const origin = getLengthableOrigin(input);
		payload.issues.push({
			origin,
			code: "too_big",
			maximum: def.maximum,
			inclusive: true,
			input,
			inst,
			continue: !def.abort
		});
	};
});
const $ZodCheckMinLength = /*@__PURE__*/ $constructor("$ZodCheckMinLength", (inst, def) => {
	var _a;
	$ZodCheck.init(inst, def);
	(_a = inst._zod.def).when ?? (_a.when = (payload) => {
		const val = payload.value;
		return !nullish(val) && val.length !== void 0;
	});
	inst._zod.onattach.push((inst) => {
		const curr = inst._zod.bag.minimum ?? Number.NEGATIVE_INFINITY;
		if (def.minimum > curr) inst._zod.bag.minimum = def.minimum;
	});
	inst._zod.check = (payload) => {
		const input = payload.value;
		if (input.length >= def.minimum) return;
		const origin = getLengthableOrigin(input);
		payload.issues.push({
			origin,
			code: "too_small",
			minimum: def.minimum,
			inclusive: true,
			input,
			inst,
			continue: !def.abort
		});
	};
});
const $ZodCheckLengthEquals = /*@__PURE__*/ $constructor("$ZodCheckLengthEquals", (inst, def) => {
	var _a;
	$ZodCheck.init(inst, def);
	(_a = inst._zod.def).when ?? (_a.when = (payload) => {
		const val = payload.value;
		return !nullish(val) && val.length !== void 0;
	});
	inst._zod.onattach.push((inst) => {
		const bag = inst._zod.bag;
		bag.minimum = def.length;
		bag.maximum = def.length;
		bag.length = def.length;
	});
	inst._zod.check = (payload) => {
		const input = payload.value;
		const length = input.length;
		if (length === def.length) return;
		const origin = getLengthableOrigin(input);
		const tooBig = length > def.length;
		payload.issues.push({
			origin,
			...tooBig ? {
				code: "too_big",
				maximum: def.length
			} : {
				code: "too_small",
				minimum: def.length
			},
			inclusive: true,
			exact: true,
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
const $ZodCheckStringFormat = /*@__PURE__*/ $constructor("$ZodCheckStringFormat", (inst, def) => {
	var _a, _b;
	$ZodCheck.init(inst, def);
	inst._zod.onattach.push((inst) => {
		const bag = inst._zod.bag;
		bag.format = def.format;
		if (def.pattern) {
			bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
			bag.patterns.add(def.pattern);
		}
	});
	if (def.pattern) (_a = inst._zod).check ?? (_a.check = (payload) => {
		def.pattern.lastIndex = 0;
		if (def.pattern.test(payload.value)) return;
		payload.issues.push({
			origin: "string",
			code: "invalid_format",
			format: def.format,
			input: payload.value,
			...def.pattern ? { pattern: def.pattern.toString() } : {},
			inst,
			continue: !def.abort
		});
	});
	else (_b = inst._zod).check ?? (_b.check = () => {});
});
const $ZodCheckRegex = /*@__PURE__*/ $constructor("$ZodCheckRegex", (inst, def) => {
	$ZodCheckStringFormat.init(inst, def);
	inst._zod.check = (payload) => {
		def.pattern.lastIndex = 0;
		if (def.pattern.test(payload.value)) return;
		payload.issues.push({
			origin: "string",
			code: "invalid_format",
			format: "regex",
			input: payload.value,
			pattern: def.pattern.toString(),
			inst,
			continue: !def.abort
		});
	};
});
const $ZodCheckLowerCase = /*@__PURE__*/ $constructor("$ZodCheckLowerCase", (inst, def) => {
	def.pattern ?? (def.pattern = lowercase);
	$ZodCheckStringFormat.init(inst, def);
});
const $ZodCheckUpperCase = /*@__PURE__*/ $constructor("$ZodCheckUpperCase", (inst, def) => {
	def.pattern ?? (def.pattern = uppercase);
	$ZodCheckStringFormat.init(inst, def);
});
const $ZodCheckIncludes = /*@__PURE__*/ $constructor("$ZodCheckIncludes", (inst, def) => {
	$ZodCheck.init(inst, def);
	const escapedRegex = escapeRegex(def.includes);
	const pattern = new RegExp(typeof def.position === "number" ? `^.{${def.position}}${escapedRegex}` : escapedRegex);
	def.pattern = pattern;
	inst._zod.onattach.push((inst) => {
		const bag = inst._zod.bag;
		bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
		bag.patterns.add(pattern);
	});
	inst._zod.check = (payload) => {
		if (payload.value.includes(def.includes, def.position)) return;
		payload.issues.push({
			origin: "string",
			code: "invalid_format",
			format: "includes",
			includes: def.includes,
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
const $ZodCheckStartsWith = /*@__PURE__*/ $constructor("$ZodCheckStartsWith", (inst, def) => {
	$ZodCheck.init(inst, def);
	const pattern = new RegExp(`^${escapeRegex(def.prefix)}.*`);
	def.pattern ?? (def.pattern = pattern);
	inst._zod.onattach.push((inst) => {
		const bag = inst._zod.bag;
		bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
		bag.patterns.add(pattern);
	});
	inst._zod.check = (payload) => {
		if (payload.value.startsWith(def.prefix)) return;
		payload.issues.push({
			origin: "string",
			code: "invalid_format",
			format: "starts_with",
			prefix: def.prefix,
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
const $ZodCheckEndsWith = /*@__PURE__*/ $constructor("$ZodCheckEndsWith", (inst, def) => {
	$ZodCheck.init(inst, def);
	const pattern = new RegExp(`.*${escapeRegex(def.suffix)}$`);
	def.pattern ?? (def.pattern = pattern);
	inst._zod.onattach.push((inst) => {
		const bag = inst._zod.bag;
		bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
		bag.patterns.add(pattern);
	});
	inst._zod.check = (payload) => {
		if (payload.value.endsWith(def.suffix)) return;
		payload.issues.push({
			origin: "string",
			code: "invalid_format",
			format: "ends_with",
			suffix: def.suffix,
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
const $ZodCheckOverwrite = /*@__PURE__*/ $constructor("$ZodCheckOverwrite", (inst, def) => {
	$ZodCheck.init(inst, def);
	inst._zod.check = (payload) => {
		payload.value = def.tx(payload.value);
	};
});
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/doc.js
var Doc = class {
	constructor(args = []) {
		this.content = [];
		this.indent = 0;
		if (this) this.args = args;
	}
	indented(fn) {
		this.indent += 1;
		fn(this);
		this.indent -= 1;
	}
	write(arg) {
		if (typeof arg === "function") {
			arg(this, { execution: "sync" });
			arg(this, { execution: "async" });
			return;
		}
		const lines = arg.split("\n").filter((x) => x);
		const minIndent = Math.min(...lines.map((x) => x.length - x.trimStart().length));
		const dedented = lines.map((x) => x.slice(minIndent)).map((x) => " ".repeat(this.indent * 2) + x);
		for (const line of dedented) this.content.push(line);
	}
	compile() {
		const F = Function;
		const args = this?.args;
		const lines = [...(this?.content ?? [``]).map((x) => `  ${x}`)];
		return new F(...args, lines.join("\n"));
	}
};
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/versions.js
const version = {
	major: 4,
	minor: 4,
	patch: 3
};
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/schemas.js
const $ZodType = /*@__PURE__*/ $constructor("$ZodType", (inst, def) => {
	var _a;
	inst ?? (inst = {});
	inst._zod.def = def;
	inst._zod.bag = inst._zod.bag || {};
	inst._zod.version = version;
	const checks = [...inst._zod.def.checks ?? []];
	if (inst._zod.traits.has("$ZodCheck")) checks.unshift(inst);
	for (const ch of checks) for (const fn of ch._zod.onattach) fn(inst);
	if (checks.length === 0) {
		(_a = inst._zod).deferred ?? (_a.deferred = []);
		inst._zod.deferred?.push(() => {
			inst._zod.run = inst._zod.parse;
		});
	} else {
		const runChecks = (payload, checks, ctx) => {
			let isAborted = aborted(payload);
			let asyncResult;
			for (const ch of checks) {
				if (ch._zod.def.when) {
					if (explicitlyAborted(payload)) continue;
					if (!ch._zod.def.when(payload)) continue;
				} else if (isAborted) continue;
				const currLen = payload.issues.length;
				const _ = ch._zod.check(payload);
				if (_ instanceof Promise && ctx?.async === false) throw new $ZodAsyncError();
				if (asyncResult || _ instanceof Promise) asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
					await _;
					if (payload.issues.length === currLen) return;
					if (!isAborted) isAborted = aborted(payload, currLen);
				});
				else {
					if (payload.issues.length === currLen) continue;
					if (!isAborted) isAborted = aborted(payload, currLen);
				}
			}
			if (asyncResult) return asyncResult.then(() => {
				return payload;
			});
			return payload;
		};
		const handleCanaryResult = (canary, payload, ctx) => {
			if (aborted(canary)) {
				canary.aborted = true;
				return canary;
			}
			const checkResult = runChecks(payload, checks, ctx);
			if (checkResult instanceof Promise) {
				if (ctx.async === false) throw new $ZodAsyncError();
				return checkResult.then((checkResult) => inst._zod.parse(checkResult, ctx));
			}
			return inst._zod.parse(checkResult, ctx);
		};
		inst._zod.run = (payload, ctx) => {
			if (ctx.skipChecks) return inst._zod.parse(payload, ctx);
			if (ctx.direction === "backward") {
				const canary = inst._zod.parse({
					value: payload.value,
					issues: []
				}, {
					...ctx,
					skipChecks: true
				});
				if (canary instanceof Promise) return canary.then((canary) => {
					return handleCanaryResult(canary, payload, ctx);
				});
				return handleCanaryResult(canary, payload, ctx);
			}
			const result = inst._zod.parse(payload, ctx);
			if (result instanceof Promise) {
				if (ctx.async === false) throw new $ZodAsyncError();
				return result.then((result) => runChecks(result, checks, ctx));
			}
			return runChecks(result, checks, ctx);
		};
	}
	defineLazy(inst, "~standard", () => ({
		validate: (value) => {
			try {
				const r = safeParse$1(inst, value);
				return r.success ? { value: r.data } : { issues: r.error?.issues };
			} catch (_) {
				return safeParseAsync$1(inst, value).then((r) => r.success ? { value: r.data } : { issues: r.error?.issues });
			}
		},
		vendor: "zod",
		version: 1
	}));
});
const $ZodString = /*@__PURE__*/ $constructor("$ZodString", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.pattern = [...inst?._zod.bag?.patterns ?? []].pop() ?? string$1(inst._zod.bag);
	inst._zod.parse = (payload, _) => {
		if (def.coerce) try {
			payload.value = String(payload.value);
		} catch (_) {}
		if (typeof payload.value === "string") return payload;
		payload.issues.push({
			expected: "string",
			code: "invalid_type",
			input: payload.value,
			inst
		});
		return payload;
	};
});
const $ZodStringFormat = /*@__PURE__*/ $constructor("$ZodStringFormat", (inst, def) => {
	$ZodCheckStringFormat.init(inst, def);
	$ZodString.init(inst, def);
});
const $ZodGUID = /*@__PURE__*/ $constructor("$ZodGUID", (inst, def) => {
	def.pattern ?? (def.pattern = guid);
	$ZodStringFormat.init(inst, def);
});
const $ZodUUID = /*@__PURE__*/ $constructor("$ZodUUID", (inst, def) => {
	if (def.version) {
		const v = {
			v1: 1,
			v2: 2,
			v3: 3,
			v4: 4,
			v5: 5,
			v6: 6,
			v7: 7,
			v8: 8
		}[def.version];
		if (v === void 0) throw new Error(`Invalid UUID version: "${def.version}"`);
		def.pattern ?? (def.pattern = uuid(v));
	} else def.pattern ?? (def.pattern = uuid());
	$ZodStringFormat.init(inst, def);
});
const $ZodEmail = /*@__PURE__*/ $constructor("$ZodEmail", (inst, def) => {
	def.pattern ?? (def.pattern = email);
	$ZodStringFormat.init(inst, def);
});
const $ZodURL = /*@__PURE__*/ $constructor("$ZodURL", (inst, def) => {
	$ZodStringFormat.init(inst, def);
	inst._zod.check = (payload) => {
		try {
			const trimmed = payload.value.trim();
			if (!def.normalize && def.protocol?.source === httpProtocol.source) {
				if (!/^https?:\/\//i.test(trimmed)) {
					payload.issues.push({
						code: "invalid_format",
						format: "url",
						note: "Invalid URL format",
						input: payload.value,
						inst,
						continue: !def.abort
					});
					return;
				}
			}
			const url = new URL(trimmed);
			if (def.hostname) {
				def.hostname.lastIndex = 0;
				if (!def.hostname.test(url.hostname)) payload.issues.push({
					code: "invalid_format",
					format: "url",
					note: "Invalid hostname",
					pattern: def.hostname.source,
					input: payload.value,
					inst,
					continue: !def.abort
				});
			}
			if (def.protocol) {
				def.protocol.lastIndex = 0;
				if (!def.protocol.test(url.protocol.endsWith(":") ? url.protocol.slice(0, -1) : url.protocol)) payload.issues.push({
					code: "invalid_format",
					format: "url",
					note: "Invalid protocol",
					pattern: def.protocol.source,
					input: payload.value,
					inst,
					continue: !def.abort
				});
			}
			if (def.normalize) payload.value = url.href;
			else payload.value = trimmed;
			return;
		} catch (_) {
			payload.issues.push({
				code: "invalid_format",
				format: "url",
				input: payload.value,
				inst,
				continue: !def.abort
			});
		}
	};
});
const $ZodEmoji = /*@__PURE__*/ $constructor("$ZodEmoji", (inst, def) => {
	def.pattern ?? (def.pattern = emoji());
	$ZodStringFormat.init(inst, def);
});
const $ZodNanoID = /*@__PURE__*/ $constructor("$ZodNanoID", (inst, def) => {
	def.pattern ?? (def.pattern = nanoid);
	$ZodStringFormat.init(inst, def);
});
/**
* @deprecated CUID v1 is deprecated by its authors due to information leakage
* (timestamps embedded in the id). Use {@link $ZodCUID2} instead.
* See https://github.com/paralleldrive/cuid.
*/
const $ZodCUID = /*@__PURE__*/ $constructor("$ZodCUID", (inst, def) => {
	def.pattern ?? (def.pattern = cuid);
	$ZodStringFormat.init(inst, def);
});
const $ZodCUID2 = /*@__PURE__*/ $constructor("$ZodCUID2", (inst, def) => {
	def.pattern ?? (def.pattern = cuid2);
	$ZodStringFormat.init(inst, def);
});
const $ZodULID = /*@__PURE__*/ $constructor("$ZodULID", (inst, def) => {
	def.pattern ?? (def.pattern = ulid);
	$ZodStringFormat.init(inst, def);
});
const $ZodXID = /*@__PURE__*/ $constructor("$ZodXID", (inst, def) => {
	def.pattern ?? (def.pattern = xid);
	$ZodStringFormat.init(inst, def);
});
const $ZodKSUID = /*@__PURE__*/ $constructor("$ZodKSUID", (inst, def) => {
	def.pattern ?? (def.pattern = ksuid);
	$ZodStringFormat.init(inst, def);
});
const $ZodISODateTime = /*@__PURE__*/ $constructor("$ZodISODateTime", (inst, def) => {
	def.pattern ?? (def.pattern = datetime$1(def));
	$ZodStringFormat.init(inst, def);
});
const $ZodISODate = /*@__PURE__*/ $constructor("$ZodISODate", (inst, def) => {
	def.pattern ?? (def.pattern = date$1);
	$ZodStringFormat.init(inst, def);
});
const $ZodISOTime = /*@__PURE__*/ $constructor("$ZodISOTime", (inst, def) => {
	def.pattern ?? (def.pattern = time$1(def));
	$ZodStringFormat.init(inst, def);
});
const $ZodISODuration = /*@__PURE__*/ $constructor("$ZodISODuration", (inst, def) => {
	def.pattern ?? (def.pattern = duration$1);
	$ZodStringFormat.init(inst, def);
});
const $ZodIPv4 = /*@__PURE__*/ $constructor("$ZodIPv4", (inst, def) => {
	def.pattern ?? (def.pattern = ipv4);
	$ZodStringFormat.init(inst, def);
	inst._zod.bag.format = `ipv4`;
});
const $ZodIPv6 = /*@__PURE__*/ $constructor("$ZodIPv6", (inst, def) => {
	def.pattern ?? (def.pattern = ipv6);
	$ZodStringFormat.init(inst, def);
	inst._zod.bag.format = `ipv6`;
	inst._zod.check = (payload) => {
		try {
			new URL(`http://[${payload.value}]`);
		} catch {
			payload.issues.push({
				code: "invalid_format",
				format: "ipv6",
				input: payload.value,
				inst,
				continue: !def.abort
			});
		}
	};
});
const $ZodCIDRv4 = /*@__PURE__*/ $constructor("$ZodCIDRv4", (inst, def) => {
	def.pattern ?? (def.pattern = cidrv4);
	$ZodStringFormat.init(inst, def);
});
const $ZodCIDRv6 = /*@__PURE__*/ $constructor("$ZodCIDRv6", (inst, def) => {
	def.pattern ?? (def.pattern = cidrv6);
	$ZodStringFormat.init(inst, def);
	inst._zod.check = (payload) => {
		const parts = payload.value.split("/");
		try {
			if (parts.length !== 2) throw new Error();
			const [address, prefix] = parts;
			if (!prefix) throw new Error();
			const prefixNum = Number(prefix);
			if (`${prefixNum}` !== prefix) throw new Error();
			if (prefixNum < 0 || prefixNum > 128) throw new Error();
			new URL(`http://[${address}]`);
		} catch {
			payload.issues.push({
				code: "invalid_format",
				format: "cidrv6",
				input: payload.value,
				inst,
				continue: !def.abort
			});
		}
	};
});
function isValidBase64(data) {
	if (data === "") return true;
	if (/\s/.test(data)) return false;
	if (data.length % 4 !== 0) return false;
	try {
		atob(data);
		return true;
	} catch {
		return false;
	}
}
const $ZodBase64 = /*@__PURE__*/ $constructor("$ZodBase64", (inst, def) => {
	def.pattern ?? (def.pattern = base64);
	$ZodStringFormat.init(inst, def);
	inst._zod.bag.contentEncoding = "base64";
	inst._zod.check = (payload) => {
		if (isValidBase64(payload.value)) return;
		payload.issues.push({
			code: "invalid_format",
			format: "base64",
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
function isValidBase64URL(data) {
	if (!base64url.test(data)) return false;
	const base64 = data.replace(/[-_]/g, (c) => c === "-" ? "+" : "/");
	return isValidBase64(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
}
const $ZodBase64URL = /*@__PURE__*/ $constructor("$ZodBase64URL", (inst, def) => {
	def.pattern ?? (def.pattern = base64url);
	$ZodStringFormat.init(inst, def);
	inst._zod.bag.contentEncoding = "base64url";
	inst._zod.check = (payload) => {
		if (isValidBase64URL(payload.value)) return;
		payload.issues.push({
			code: "invalid_format",
			format: "base64url",
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
const $ZodE164 = /*@__PURE__*/ $constructor("$ZodE164", (inst, def) => {
	def.pattern ?? (def.pattern = e164);
	$ZodStringFormat.init(inst, def);
});
function isValidJWT(token, algorithm = null) {
	try {
		const tokensParts = token.split(".");
		if (tokensParts.length !== 3) return false;
		const [header] = tokensParts;
		if (!header) return false;
		const parsedHeader = JSON.parse(atob(header));
		if ("typ" in parsedHeader && parsedHeader?.typ !== "JWT") return false;
		if (!parsedHeader.alg) return false;
		if (algorithm && (!("alg" in parsedHeader) || parsedHeader.alg !== algorithm)) return false;
		return true;
	} catch {
		return false;
	}
}
const $ZodJWT = /*@__PURE__*/ $constructor("$ZodJWT", (inst, def) => {
	$ZodStringFormat.init(inst, def);
	inst._zod.check = (payload) => {
		if (isValidJWT(payload.value, def.alg)) return;
		payload.issues.push({
			code: "invalid_format",
			format: "jwt",
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
const $ZodNumber = /*@__PURE__*/ $constructor("$ZodNumber", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.pattern = inst._zod.bag.pattern ?? number$1;
	inst._zod.parse = (payload, _ctx) => {
		if (def.coerce) try {
			payload.value = Number(payload.value);
		} catch (_) {}
		const input = payload.value;
		if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) return payload;
		const received = typeof input === "number" ? Number.isNaN(input) ? "NaN" : !Number.isFinite(input) ? "Infinity" : void 0 : void 0;
		payload.issues.push({
			expected: "number",
			code: "invalid_type",
			input,
			inst,
			...received ? { received } : {}
		});
		return payload;
	};
});
const $ZodNumberFormat = /*@__PURE__*/ $constructor("$ZodNumberFormat", (inst, def) => {
	$ZodCheckNumberFormat.init(inst, def);
	$ZodNumber.init(inst, def);
});
const $ZodBoolean = /*@__PURE__*/ $constructor("$ZodBoolean", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.pattern = boolean$1;
	inst._zod.parse = (payload, _ctx) => {
		if (def.coerce) try {
			payload.value = Boolean(payload.value);
		} catch (_) {}
		const input = payload.value;
		if (typeof input === "boolean") return payload;
		payload.issues.push({
			expected: "boolean",
			code: "invalid_type",
			input,
			inst
		});
		return payload;
	};
});
const $ZodUndefined = /*@__PURE__*/ $constructor("$ZodUndefined", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.pattern = _undefined$2;
	inst._zod.values = /* @__PURE__ */ new Set([void 0]);
	inst._zod.parse = (payload, _ctx) => {
		const input = payload.value;
		if (typeof input === "undefined") return payload;
		payload.issues.push({
			expected: "undefined",
			code: "invalid_type",
			input,
			inst
		});
		return payload;
	};
});
const $ZodUnknown = /*@__PURE__*/ $constructor("$ZodUnknown", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.parse = (payload) => payload;
});
const $ZodNever = /*@__PURE__*/ $constructor("$ZodNever", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.parse = (payload, _ctx) => {
		payload.issues.push({
			expected: "never",
			code: "invalid_type",
			input: payload.value,
			inst
		});
		return payload;
	};
});
const $ZodVoid = /*@__PURE__*/ $constructor("$ZodVoid", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.parse = (payload, _ctx) => {
		const input = payload.value;
		if (typeof input === "undefined") return payload;
		payload.issues.push({
			expected: "void",
			code: "invalid_type",
			input,
			inst
		});
		return payload;
	};
});
function handleArrayResult(result, final, index) {
	if (result.issues.length) final.issues.push(...prefixIssues(index, result.issues));
	final.value[index] = result.value;
}
const $ZodArray = /*@__PURE__*/ $constructor("$ZodArray", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.parse = (payload, ctx) => {
		const input = payload.value;
		if (!Array.isArray(input)) {
			payload.issues.push({
				expected: "array",
				code: "invalid_type",
				input,
				inst
			});
			return payload;
		}
		payload.value = Array(input.length);
		const proms = [];
		for (let i = 0; i < input.length; i++) {
			const item = input[i];
			const result = def.element._zod.run({
				value: item,
				issues: []
			}, ctx);
			if (result instanceof Promise) proms.push(result.then((result) => handleArrayResult(result, payload, i)));
			else handleArrayResult(result, payload, i);
		}
		if (proms.length) return Promise.all(proms).then(() => payload);
		return payload;
	};
});
function handlePropertyResult(result, final, key, input, isOptionalIn, isOptionalOut) {
	const isPresent = key in input;
	if (result.issues.length) {
		if (isOptionalIn && isOptionalOut && !isPresent) return;
		final.issues.push(...prefixIssues(key, result.issues));
	}
	if (!isPresent && !isOptionalIn) {
		if (!result.issues.length) final.issues.push({
			code: "invalid_type",
			expected: "nonoptional",
			input: void 0,
			path: [key]
		});
		return;
	}
	if (result.value === void 0) {
		if (isPresent) final.value[key] = void 0;
	} else final.value[key] = result.value;
}
function normalizeDef(def) {
	const keys = Object.keys(def.shape);
	for (const k of keys) if (!def.shape?.[k]?._zod?.traits?.has("$ZodType")) throw new Error(`Invalid element at key "${k}": expected a Zod schema`);
	const okeys = optionalKeys(def.shape);
	return {
		...def,
		keys,
		keySet: new Set(keys),
		numKeys: keys.length,
		optionalKeys: new Set(okeys)
	};
}
function handleCatchall(proms, input, payload, ctx, def, inst) {
	const unrecognized = [];
	const keySet = def.keySet;
	const _catchall = def.catchall._zod;
	const t = _catchall.def.type;
	const isOptionalIn = _catchall.optin === "optional";
	const isOptionalOut = _catchall.optout === "optional";
	for (const key in input) {
		if (key === "__proto__") continue;
		if (keySet.has(key)) continue;
		if (t === "never") {
			unrecognized.push(key);
			continue;
		}
		const r = _catchall.run({
			value: input[key],
			issues: []
		}, ctx);
		if (r instanceof Promise) proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut)));
		else handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut);
	}
	if (unrecognized.length) payload.issues.push({
		code: "unrecognized_keys",
		keys: unrecognized,
		input,
		inst
	});
	if (!proms.length) return payload;
	return Promise.all(proms).then(() => {
		return payload;
	});
}
const $ZodObject = /*@__PURE__*/ $constructor("$ZodObject", (inst, def) => {
	$ZodType.init(inst, def);
	if (!Object.getOwnPropertyDescriptor(def, "shape")?.get) {
		const sh = def.shape;
		Object.defineProperty(def, "shape", { get: () => {
			const newSh = { ...sh };
			Object.defineProperty(def, "shape", { value: newSh });
			return newSh;
		} });
	}
	const _normalized = cached(() => normalizeDef(def));
	defineLazy(inst._zod, "propValues", () => {
		const shape = def.shape;
		const propValues = {};
		for (const key in shape) {
			const field = shape[key]._zod;
			if (field.values) {
				propValues[key] ?? (propValues[key] = /* @__PURE__ */ new Set());
				for (const v of field.values) propValues[key].add(v);
			}
		}
		return propValues;
	});
	const isObject$1 = isObject;
	const catchall = def.catchall;
	let value;
	inst._zod.parse = (payload, ctx) => {
		value ?? (value = _normalized.value);
		const input = payload.value;
		if (!isObject$1(input)) {
			payload.issues.push({
				expected: "object",
				code: "invalid_type",
				input,
				inst
			});
			return payload;
		}
		payload.value = {};
		const proms = [];
		const shape = value.shape;
		for (const key of value.keys) {
			const el = shape[key];
			const isOptionalIn = el._zod.optin === "optional";
			const isOptionalOut = el._zod.optout === "optional";
			const r = el._zod.run({
				value: input[key],
				issues: []
			}, ctx);
			if (r instanceof Promise) proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut)));
			else handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut);
		}
		if (!catchall) return proms.length ? Promise.all(proms).then(() => payload) : payload;
		return handleCatchall(proms, input, payload, ctx, _normalized.value, inst);
	};
});
const $ZodObjectJIT = /*@__PURE__*/ $constructor("$ZodObjectJIT", (inst, def) => {
	$ZodObject.init(inst, def);
	const superParse = inst._zod.parse;
	const _normalized = cached(() => normalizeDef(def));
	const generateFastpass = (shape) => {
		const doc = new Doc([
			"shape",
			"payload",
			"ctx"
		]);
		const normalized = _normalized.value;
		const parseStr = (key) => {
			const k = esc(key);
			return `shape[${k}]._zod.run({ value: input[${k}], issues: [] }, ctx)`;
		};
		doc.write(`const input = payload.value;`);
		const ids = Object.create(null);
		let counter = 0;
		for (const key of normalized.keys) ids[key] = `key_${counter++}`;
		doc.write(`const newResult = {};`);
		for (const key of normalized.keys) {
			const id = ids[key];
			const k = esc(key);
			const schema = shape[key];
			const isOptionalIn = schema?._zod?.optin === "optional";
			const isOptionalOut = schema?._zod?.optout === "optional";
			doc.write(`const ${id} = ${parseStr(key)};`);
			if (isOptionalIn && isOptionalOut) doc.write(`
        if (${id}.issues.length) {
          if (${k} in input) {
            payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
              ...iss,
              path: iss.path ? [${k}, ...iss.path] : [${k}]
            })));
          }
        }

        if (${id}.value === undefined) {
          if (${k} in input) {
            newResult[${k}] = undefined;
          }
        } else {
          newResult[${k}] = ${id}.value;
        }

      `);
			else if (!isOptionalIn) doc.write(`
        const ${id}_present = ${k} in input;
        if (${id}.issues.length) {
          payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${k}, ...iss.path] : [${k}]
          })));
        }
        if (!${id}_present && !${id}.issues.length) {
          payload.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: undefined,
            path: [${k}]
          });
        }

        if (${id}_present) {
          if (${id}.value === undefined) {
            newResult[${k}] = undefined;
          } else {
            newResult[${k}] = ${id}.value;
          }
        }

      `);
			else doc.write(`
        if (${id}.issues.length) {
          payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${k}, ...iss.path] : [${k}]
          })));
        }

        if (${id}.value === undefined) {
          if (${k} in input) {
            newResult[${k}] = undefined;
          }
        } else {
          newResult[${k}] = ${id}.value;
        }

      `);
		}
		doc.write(`payload.value = newResult;`);
		doc.write(`return payload;`);
		const fn = doc.compile();
		return (payload, ctx) => fn(shape, payload, ctx);
	};
	let fastpass;
	const isObject$2 = isObject;
	const jit = !globalConfig.jitless;
	const fastEnabled = jit && allowsEval.value;
	const catchall = def.catchall;
	let value;
	inst._zod.parse = (payload, ctx) => {
		value ?? (value = _normalized.value);
		const input = payload.value;
		if (!isObject$2(input)) {
			payload.issues.push({
				expected: "object",
				code: "invalid_type",
				input,
				inst
			});
			return payload;
		}
		if (jit && fastEnabled && ctx?.async === false && ctx.jitless !== true) {
			if (!fastpass) fastpass = generateFastpass(def.shape);
			payload = fastpass(payload, ctx);
			if (!catchall) return payload;
			return handleCatchall([], input, payload, ctx, value, inst);
		}
		return superParse(payload, ctx);
	};
});
function handleUnionResults(results, final, inst, ctx) {
	for (const result of results) if (result.issues.length === 0) {
		final.value = result.value;
		return final;
	}
	const nonaborted = results.filter((r) => !aborted(r));
	if (nonaborted.length === 1) {
		final.value = nonaborted[0].value;
		return nonaborted[0];
	}
	final.issues.push({
		code: "invalid_union",
		input: final.value,
		inst,
		errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
	});
	return final;
}
const $ZodUnion = /*@__PURE__*/ $constructor("$ZodUnion", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazy(inst._zod, "optin", () => def.options.some((o) => o._zod.optin === "optional") ? "optional" : void 0);
	defineLazy(inst._zod, "optout", () => def.options.some((o) => o._zod.optout === "optional") ? "optional" : void 0);
	defineLazy(inst._zod, "values", () => {
		if (def.options.every((o) => o._zod.values)) return new Set(def.options.flatMap((option) => Array.from(option._zod.values)));
	});
	defineLazy(inst._zod, "pattern", () => {
		if (def.options.every((o) => o._zod.pattern)) {
			const patterns = def.options.map((o) => o._zod.pattern);
			return new RegExp(`^(${patterns.map((p) => cleanRegex(p.source)).join("|")})$`);
		}
	});
	const first = def.options.length === 1 ? def.options[0]._zod.run : null;
	inst._zod.parse = (payload, ctx) => {
		if (first) return first(payload, ctx);
		let async = false;
		const results = [];
		for (const option of def.options) {
			const result = option._zod.run({
				value: payload.value,
				issues: []
			}, ctx);
			if (result instanceof Promise) {
				results.push(result);
				async = true;
			} else {
				if (result.issues.length === 0) return result;
				results.push(result);
			}
		}
		if (!async) return handleUnionResults(results, payload, inst, ctx);
		return Promise.all(results).then((results) => {
			return handleUnionResults(results, payload, inst, ctx);
		});
	};
});
const $ZodIntersection = /*@__PURE__*/ $constructor("$ZodIntersection", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.parse = (payload, ctx) => {
		const input = payload.value;
		const left = def.left._zod.run({
			value: input,
			issues: []
		}, ctx);
		const right = def.right._zod.run({
			value: input,
			issues: []
		}, ctx);
		if (left instanceof Promise || right instanceof Promise) return Promise.all([left, right]).then(([left, right]) => {
			return handleIntersectionResults(payload, left, right);
		});
		return handleIntersectionResults(payload, left, right);
	};
});
function mergeValues(a, b) {
	if (a === b) return {
		valid: true,
		data: a
	};
	if (a instanceof Date && b instanceof Date && +a === +b) return {
		valid: true,
		data: a
	};
	if (isPlainObject(a) && isPlainObject(b)) {
		const bKeys = Object.keys(b);
		const sharedKeys = Object.keys(a).filter((key) => bKeys.indexOf(key) !== -1);
		const newObj = {
			...a,
			...b
		};
		for (const key of sharedKeys) {
			const sharedValue = mergeValues(a[key], b[key]);
			if (!sharedValue.valid) return {
				valid: false,
				mergeErrorPath: [key, ...sharedValue.mergeErrorPath]
			};
			newObj[key] = sharedValue.data;
		}
		return {
			valid: true,
			data: newObj
		};
	}
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return {
			valid: false,
			mergeErrorPath: []
		};
		const newArray = [];
		for (let index = 0; index < a.length; index++) {
			const itemA = a[index];
			const itemB = b[index];
			const sharedValue = mergeValues(itemA, itemB);
			if (!sharedValue.valid) return {
				valid: false,
				mergeErrorPath: [index, ...sharedValue.mergeErrorPath]
			};
			newArray.push(sharedValue.data);
		}
		return {
			valid: true,
			data: newArray
		};
	}
	return {
		valid: false,
		mergeErrorPath: []
	};
}
function handleIntersectionResults(result, left, right) {
	const unrecKeys = /* @__PURE__ */ new Map();
	let unrecIssue;
	for (const iss of left.issues) if (iss.code === "unrecognized_keys") {
		unrecIssue ?? (unrecIssue = iss);
		for (const k of iss.keys) {
			if (!unrecKeys.has(k)) unrecKeys.set(k, {});
			unrecKeys.get(k).l = true;
		}
	} else result.issues.push(iss);
	for (const iss of right.issues) if (iss.code === "unrecognized_keys") for (const k of iss.keys) {
		if (!unrecKeys.has(k)) unrecKeys.set(k, {});
		unrecKeys.get(k).r = true;
	}
	else result.issues.push(iss);
	const bothKeys = [...unrecKeys].filter(([, f]) => f.l && f.r).map(([k]) => k);
	if (bothKeys.length && unrecIssue) result.issues.push({
		...unrecIssue,
		keys: bothKeys
	});
	if (aborted(result)) return result;
	const merged = mergeValues(left.value, right.value);
	if (!merged.valid) throw new Error(`Unmergable intersection. Error path: ${JSON.stringify(merged.mergeErrorPath)}`);
	result.value = merged.data;
	return result;
}
const $ZodEnum = /*@__PURE__*/ $constructor("$ZodEnum", (inst, def) => {
	$ZodType.init(inst, def);
	const values = getEnumValues(def.entries);
	const valuesSet = new Set(values);
	inst._zod.values = valuesSet;
	inst._zod.pattern = new RegExp(`^(${values.filter((k) => propertyKeyTypes.has(typeof k)).map((o) => typeof o === "string" ? escapeRegex(o) : o.toString()).join("|")})$`);
	inst._zod.parse = (payload, _ctx) => {
		const input = payload.value;
		if (valuesSet.has(input)) return payload;
		payload.issues.push({
			code: "invalid_value",
			values,
			input,
			inst
		});
		return payload;
	};
});
const $ZodLiteral = /*@__PURE__*/ $constructor("$ZodLiteral", (inst, def) => {
	$ZodType.init(inst, def);
	if (def.values.length === 0) throw new Error("Cannot create literal schema with no valid values");
	const values = new Set(def.values);
	inst._zod.values = values;
	inst._zod.pattern = new RegExp(`^(${def.values.map((o) => typeof o === "string" ? escapeRegex(o) : o ? escapeRegex(o.toString()) : String(o)).join("|")})$`);
	inst._zod.parse = (payload, _ctx) => {
		const input = payload.value;
		if (values.has(input)) return payload;
		payload.issues.push({
			code: "invalid_value",
			values: def.values,
			input,
			inst
		});
		return payload;
	};
});
const $ZodTransform = /*@__PURE__*/ $constructor("$ZodTransform", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.optin = "optional";
	inst._zod.parse = (payload, ctx) => {
		if (ctx.direction === "backward") throw new $ZodEncodeError(inst.constructor.name);
		const _out = def.transform(payload.value, payload);
		if (ctx.async) return (_out instanceof Promise ? _out : Promise.resolve(_out)).then((output) => {
			payload.value = output;
			payload.fallback = true;
			return payload;
		});
		if (_out instanceof Promise) throw new $ZodAsyncError();
		payload.value = _out;
		payload.fallback = true;
		return payload;
	};
});
function handleOptionalResult(result, input) {
	if (input === void 0 && (result.issues.length || result.fallback)) return {
		issues: [],
		value: void 0
	};
	return result;
}
const $ZodOptional = /*@__PURE__*/ $constructor("$ZodOptional", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.optin = "optional";
	inst._zod.optout = "optional";
	defineLazy(inst._zod, "values", () => {
		return def.innerType._zod.values ? /* @__PURE__ */ new Set([...def.innerType._zod.values, void 0]) : void 0;
	});
	defineLazy(inst._zod, "pattern", () => {
		const pattern = def.innerType._zod.pattern;
		return pattern ? new RegExp(`^(${cleanRegex(pattern.source)})?$`) : void 0;
	});
	inst._zod.parse = (payload, ctx) => {
		if (def.innerType._zod.optin === "optional") {
			const input = payload.value;
			const result = def.innerType._zod.run(payload, ctx);
			if (result instanceof Promise) return result.then((r) => handleOptionalResult(r, input));
			return handleOptionalResult(result, input);
		}
		if (payload.value === void 0) return payload;
		return def.innerType._zod.run(payload, ctx);
	};
});
const $ZodExactOptional = /*@__PURE__*/ $constructor("$ZodExactOptional", (inst, def) => {
	$ZodOptional.init(inst, def);
	defineLazy(inst._zod, "values", () => def.innerType._zod.values);
	defineLazy(inst._zod, "pattern", () => def.innerType._zod.pattern);
	inst._zod.parse = (payload, ctx) => {
		return def.innerType._zod.run(payload, ctx);
	};
});
const $ZodNullable = /*@__PURE__*/ $constructor("$ZodNullable", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazy(inst._zod, "optin", () => def.innerType._zod.optin);
	defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
	defineLazy(inst._zod, "pattern", () => {
		const pattern = def.innerType._zod.pattern;
		return pattern ? new RegExp(`^(${cleanRegex(pattern.source)}|null)$`) : void 0;
	});
	defineLazy(inst._zod, "values", () => {
		return def.innerType._zod.values ? /* @__PURE__ */ new Set([...def.innerType._zod.values, null]) : void 0;
	});
	inst._zod.parse = (payload, ctx) => {
		if (payload.value === null) return payload;
		return def.innerType._zod.run(payload, ctx);
	};
});
const $ZodDefault = /*@__PURE__*/ $constructor("$ZodDefault", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.optin = "optional";
	defineLazy(inst._zod, "values", () => def.innerType._zod.values);
	inst._zod.parse = (payload, ctx) => {
		if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
		if (payload.value === void 0) {
			payload.value = def.defaultValue;
			/**
			* $ZodDefault returns the default value immediately in forward direction.
			* It doesn't pass the default value into the validator ("prefault"). There's no reason to pass the default value through validation. The validity of the default is enforced by TypeScript statically. Otherwise, it's the responsibility of the user to ensure the default is valid. In the case of pipes with divergent in/out types, you can specify the default on the `in` schema of your ZodPipe to set a "prefault" for the pipe.   */
			return payload;
		}
		const result = def.innerType._zod.run(payload, ctx);
		if (result instanceof Promise) return result.then((result) => handleDefaultResult(result, def));
		return handleDefaultResult(result, def);
	};
});
function handleDefaultResult(payload, def) {
	if (payload.value === void 0) payload.value = def.defaultValue;
	return payload;
}
const $ZodPrefault = /*@__PURE__*/ $constructor("$ZodPrefault", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.optin = "optional";
	defineLazy(inst._zod, "values", () => def.innerType._zod.values);
	inst._zod.parse = (payload, ctx) => {
		if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
		if (payload.value === void 0) payload.value = def.defaultValue;
		return def.innerType._zod.run(payload, ctx);
	};
});
const $ZodNonOptional = /*@__PURE__*/ $constructor("$ZodNonOptional", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazy(inst._zod, "values", () => {
		const v = def.innerType._zod.values;
		return v ? new Set([...v].filter((x) => x !== void 0)) : void 0;
	});
	inst._zod.parse = (payload, ctx) => {
		const result = def.innerType._zod.run(payload, ctx);
		if (result instanceof Promise) return result.then((result) => handleNonOptionalResult(result, inst));
		return handleNonOptionalResult(result, inst);
	};
});
function handleNonOptionalResult(payload, inst) {
	if (!payload.issues.length && payload.value === void 0) payload.issues.push({
		code: "invalid_type",
		expected: "nonoptional",
		input: payload.value,
		inst
	});
	return payload;
}
const $ZodCatch = /*@__PURE__*/ $constructor("$ZodCatch", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.optin = "optional";
	defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
	defineLazy(inst._zod, "values", () => def.innerType._zod.values);
	inst._zod.parse = (payload, ctx) => {
		if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
		const result = def.innerType._zod.run(payload, ctx);
		if (result instanceof Promise) return result.then((result) => {
			payload.value = result.value;
			if (result.issues.length) {
				payload.value = def.catchValue({
					...payload,
					error: { issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config())) },
					input: payload.value
				});
				payload.issues = [];
				payload.fallback = true;
			}
			return payload;
		});
		payload.value = result.value;
		if (result.issues.length) {
			payload.value = def.catchValue({
				...payload,
				error: { issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config())) },
				input: payload.value
			});
			payload.issues = [];
			payload.fallback = true;
		}
		return payload;
	};
});
const $ZodPipe = /*@__PURE__*/ $constructor("$ZodPipe", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazy(inst._zod, "values", () => def.in._zod.values);
	defineLazy(inst._zod, "optin", () => def.in._zod.optin);
	defineLazy(inst._zod, "optout", () => def.out._zod.optout);
	defineLazy(inst._zod, "propValues", () => def.in._zod.propValues);
	inst._zod.parse = (payload, ctx) => {
		if (ctx.direction === "backward") {
			const right = def.out._zod.run(payload, ctx);
			if (right instanceof Promise) return right.then((right) => handlePipeResult(right, def.in, ctx));
			return handlePipeResult(right, def.in, ctx);
		}
		const left = def.in._zod.run(payload, ctx);
		if (left instanceof Promise) return left.then((left) => handlePipeResult(left, def.out, ctx));
		return handlePipeResult(left, def.out, ctx);
	};
});
function handlePipeResult(left, next, ctx) {
	if (left.issues.length) {
		left.aborted = true;
		return left;
	}
	return next._zod.run({
		value: left.value,
		issues: left.issues,
		fallback: left.fallback
	}, ctx);
}
const $ZodReadonly = /*@__PURE__*/ $constructor("$ZodReadonly", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazy(inst._zod, "propValues", () => def.innerType._zod.propValues);
	defineLazy(inst._zod, "values", () => def.innerType._zod.values);
	defineLazy(inst._zod, "optin", () => def.innerType?._zod?.optin);
	defineLazy(inst._zod, "optout", () => def.innerType?._zod?.optout);
	inst._zod.parse = (payload, ctx) => {
		if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
		const result = def.innerType._zod.run(payload, ctx);
		if (result instanceof Promise) return result.then(handleReadonlyResult);
		return handleReadonlyResult(result);
	};
});
function handleReadonlyResult(payload) {
	payload.value = Object.freeze(payload.value);
	return payload;
}
const $ZodCustom = /*@__PURE__*/ $constructor("$ZodCustom", (inst, def) => {
	$ZodCheck.init(inst, def);
	$ZodType.init(inst, def);
	inst._zod.parse = (payload, _) => {
		return payload;
	};
	inst._zod.check = (payload) => {
		const input = payload.value;
		const r = def.fn(input);
		if (r instanceof Promise) return r.then((r) => handleRefineResult(r, payload, input, inst));
		handleRefineResult(r, payload, input, inst);
	};
});
function handleRefineResult(result, payload, input, inst) {
	if (!result) {
		const _iss = {
			code: "custom",
			input,
			inst,
			path: [...inst._zod.def.path ?? []],
			continue: !inst._zod.def.abort
		};
		if (inst._zod.def.params) _iss.params = inst._zod.def.params;
		payload.issues.push(issue(_iss));
	}
}
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/registries.js
var _a;
var $ZodRegistry = class {
	constructor() {
		this._map = /* @__PURE__ */ new WeakMap();
		this._idmap = /* @__PURE__ */ new Map();
	}
	add(schema, ..._meta) {
		const meta = _meta[0];
		this._map.set(schema, meta);
		if (meta && typeof meta === "object" && "id" in meta) this._idmap.set(meta.id, schema);
		return this;
	}
	clear() {
		this._map = /* @__PURE__ */ new WeakMap();
		this._idmap = /* @__PURE__ */ new Map();
		return this;
	}
	remove(schema) {
		const meta = this._map.get(schema);
		if (meta && typeof meta === "object" && "id" in meta) this._idmap.delete(meta.id);
		this._map.delete(schema);
		return this;
	}
	get(schema) {
		const p = schema._zod.parent;
		if (p) {
			const pm = { ...this.get(p) ?? {} };
			delete pm.id;
			const f = {
				...pm,
				...this._map.get(schema)
			};
			return Object.keys(f).length ? f : void 0;
		}
		return this._map.get(schema);
	}
	has(schema) {
		return this._map.has(schema);
	}
};
function registry() {
	return new $ZodRegistry();
}
(_a = globalThis).__zod_globalRegistry ?? (_a.__zod_globalRegistry = registry());
const globalRegistry = globalThis.__zod_globalRegistry;
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/api.js
// @__NO_SIDE_EFFECTS__
function _string(Class, params) {
	return new Class({
		type: "string",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _email(Class, params) {
	return new Class({
		type: "string",
		format: "email",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _guid(Class, params) {
	return new Class({
		type: "string",
		format: "guid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _uuid(Class, params) {
	return new Class({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _uuidv4(Class, params) {
	return new Class({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: false,
		version: "v4",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _uuidv6(Class, params) {
	return new Class({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: false,
		version: "v6",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _uuidv7(Class, params) {
	return new Class({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: false,
		version: "v7",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _url(Class, params) {
	return new Class({
		type: "string",
		format: "url",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _emoji(Class, params) {
	return new Class({
		type: "string",
		format: "emoji",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _nanoid(Class, params) {
	return new Class({
		type: "string",
		format: "nanoid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
/**
* @deprecated CUID v1 is deprecated by its authors due to information leakage
* (timestamps embedded in the id). Use {@link _cuid2} instead.
* See https://github.com/paralleldrive/cuid.
*/
// @__NO_SIDE_EFFECTS__
function _cuid(Class, params) {
	return new Class({
		type: "string",
		format: "cuid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _cuid2(Class, params) {
	return new Class({
		type: "string",
		format: "cuid2",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _ulid(Class, params) {
	return new Class({
		type: "string",
		format: "ulid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _xid(Class, params) {
	return new Class({
		type: "string",
		format: "xid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _ksuid(Class, params) {
	return new Class({
		type: "string",
		format: "ksuid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _ipv4(Class, params) {
	return new Class({
		type: "string",
		format: "ipv4",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _ipv6(Class, params) {
	return new Class({
		type: "string",
		format: "ipv6",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _cidrv4(Class, params) {
	return new Class({
		type: "string",
		format: "cidrv4",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _cidrv6(Class, params) {
	return new Class({
		type: "string",
		format: "cidrv6",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _base64(Class, params) {
	return new Class({
		type: "string",
		format: "base64",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _base64url(Class, params) {
	return new Class({
		type: "string",
		format: "base64url",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _e164(Class, params) {
	return new Class({
		type: "string",
		format: "e164",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _jwt(Class, params) {
	return new Class({
		type: "string",
		format: "jwt",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _isoDateTime(Class, params) {
	return new Class({
		type: "string",
		format: "datetime",
		check: "string_format",
		offset: false,
		local: false,
		precision: null,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _isoDate(Class, params) {
	return new Class({
		type: "string",
		format: "date",
		check: "string_format",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _isoTime(Class, params) {
	return new Class({
		type: "string",
		format: "time",
		check: "string_format",
		precision: null,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _isoDuration(Class, params) {
	return new Class({
		type: "string",
		format: "duration",
		check: "string_format",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _number(Class, params) {
	return new Class({
		type: "number",
		checks: [],
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _int(Class, params) {
	return new Class({
		type: "number",
		check: "number_format",
		abort: false,
		format: "safeint",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _boolean(Class, params) {
	return new Class({
		type: "boolean",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _undefined$1(Class, params) {
	return new Class({
		type: "undefined",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _unknown(Class) {
	return new Class({ type: "unknown" });
}
// @__NO_SIDE_EFFECTS__
function _never(Class, params) {
	return new Class({
		type: "never",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _void$1(Class, params) {
	return new Class({
		type: "void",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _lt(value, params) {
	return new $ZodCheckLessThan({
		check: "less_than",
		...normalizeParams(params),
		value,
		inclusive: false
	});
}
// @__NO_SIDE_EFFECTS__
function _lte(value, params) {
	return new $ZodCheckLessThan({
		check: "less_than",
		...normalizeParams(params),
		value,
		inclusive: true
	});
}
// @__NO_SIDE_EFFECTS__
function _gt(value, params) {
	return new $ZodCheckGreaterThan({
		check: "greater_than",
		...normalizeParams(params),
		value,
		inclusive: false
	});
}
// @__NO_SIDE_EFFECTS__
function _gte(value, params) {
	return new $ZodCheckGreaterThan({
		check: "greater_than",
		...normalizeParams(params),
		value,
		inclusive: true
	});
}
// @__NO_SIDE_EFFECTS__
function _multipleOf(value, params) {
	return new $ZodCheckMultipleOf({
		check: "multiple_of",
		...normalizeParams(params),
		value
	});
}
// @__NO_SIDE_EFFECTS__
function _maxLength(maximum, params) {
	return new $ZodCheckMaxLength({
		check: "max_length",
		...normalizeParams(params),
		maximum
	});
}
// @__NO_SIDE_EFFECTS__
function _minLength(minimum, params) {
	return new $ZodCheckMinLength({
		check: "min_length",
		...normalizeParams(params),
		minimum
	});
}
// @__NO_SIDE_EFFECTS__
function _length(length, params) {
	return new $ZodCheckLengthEquals({
		check: "length_equals",
		...normalizeParams(params),
		length
	});
}
// @__NO_SIDE_EFFECTS__
function _regex(pattern, params) {
	return new $ZodCheckRegex({
		check: "string_format",
		format: "regex",
		...normalizeParams(params),
		pattern
	});
}
// @__NO_SIDE_EFFECTS__
function _lowercase(params) {
	return new $ZodCheckLowerCase({
		check: "string_format",
		format: "lowercase",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _uppercase(params) {
	return new $ZodCheckUpperCase({
		check: "string_format",
		format: "uppercase",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _includes(includes, params) {
	return new $ZodCheckIncludes({
		check: "string_format",
		format: "includes",
		...normalizeParams(params),
		includes
	});
}
// @__NO_SIDE_EFFECTS__
function _startsWith(prefix, params) {
	return new $ZodCheckStartsWith({
		check: "string_format",
		format: "starts_with",
		...normalizeParams(params),
		prefix
	});
}
// @__NO_SIDE_EFFECTS__
function _endsWith(suffix, params) {
	return new $ZodCheckEndsWith({
		check: "string_format",
		format: "ends_with",
		...normalizeParams(params),
		suffix
	});
}
// @__NO_SIDE_EFFECTS__
function _overwrite(tx) {
	return new $ZodCheckOverwrite({
		check: "overwrite",
		tx
	});
}
// @__NO_SIDE_EFFECTS__
function _normalize(form) {
	return /* @__PURE__ */ _overwrite((input) => input.normalize(form));
}
// @__NO_SIDE_EFFECTS__
function _trim() {
	return /* @__PURE__ */ _overwrite((input) => input.trim());
}
// @__NO_SIDE_EFFECTS__
function _toLowerCase() {
	return /* @__PURE__ */ _overwrite((input) => input.toLowerCase());
}
// @__NO_SIDE_EFFECTS__
function _toUpperCase() {
	return /* @__PURE__ */ _overwrite((input) => input.toUpperCase());
}
// @__NO_SIDE_EFFECTS__
function _slugify() {
	return /* @__PURE__ */ _overwrite((input) => slugify(input));
}
// @__NO_SIDE_EFFECTS__
function _array(Class, element, params) {
	return new Class({
		type: "array",
		element,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _refine(Class, fn, _params) {
	return new Class({
		type: "custom",
		check: "custom",
		fn,
		...normalizeParams(_params)
	});
}
// @__NO_SIDE_EFFECTS__
function _superRefine(fn, params) {
	const ch = /* @__PURE__ */ _check((payload) => {
		payload.addIssue = (issue$2) => {
			if (typeof issue$2 === "string") payload.issues.push(issue(issue$2, payload.value, ch._zod.def));
			else {
				const _issue = issue$2;
				if (_issue.fatal) _issue.continue = false;
				_issue.code ?? (_issue.code = "custom");
				_issue.input ?? (_issue.input = payload.value);
				_issue.inst ?? (_issue.inst = ch);
				_issue.continue ?? (_issue.continue = !ch._zod.def.abort);
				payload.issues.push(issue(_issue));
			}
		};
		return fn(payload.value, payload);
	}, params);
	return ch;
}
// @__NO_SIDE_EFFECTS__
function _check(fn, params) {
	const ch = new $ZodCheck({
		check: "custom",
		...normalizeParams(params)
	});
	ch._zod.check = fn;
	return ch;
}
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/to-json-schema.js
function initializeContext(params) {
	let target = params?.target ?? "draft-2020-12";
	if (target === "draft-4") target = "draft-04";
	if (target === "draft-7") target = "draft-07";
	return {
		processors: params.processors ?? {},
		metadataRegistry: params?.metadata ?? globalRegistry,
		target,
		unrepresentable: params?.unrepresentable ?? "throw",
		override: params?.override ?? (() => {}),
		io: params?.io ?? "output",
		counter: 0,
		seen: /* @__PURE__ */ new Map(),
		cycles: params?.cycles ?? "ref",
		reused: params?.reused ?? "inline",
		external: params?.external ?? void 0
	};
}
function process(schema, ctx, _params = {
	path: [],
	schemaPath: []
}) {
	var _a;
	const def = schema._zod.def;
	const seen = ctx.seen.get(schema);
	if (seen) {
		seen.count++;
		if (_params.schemaPath.includes(schema)) seen.cycle = _params.path;
		return seen.schema;
	}
	const result = {
		schema: {},
		count: 1,
		cycle: void 0,
		path: _params.path
	};
	ctx.seen.set(schema, result);
	const overrideSchema = schema._zod.toJSONSchema?.();
	if (overrideSchema) result.schema = overrideSchema;
	else {
		const params = {
			..._params,
			schemaPath: [..._params.schemaPath, schema],
			path: _params.path
		};
		if (schema._zod.processJSONSchema) schema._zod.processJSONSchema(ctx, result.schema, params);
		else {
			const _json = result.schema;
			const processor = ctx.processors[def.type];
			if (!processor) throw new Error(`[toJSONSchema]: Non-representable type encountered: ${def.type}`);
			processor(schema, ctx, _json, params);
		}
		const parent = schema._zod.parent;
		if (parent) {
			if (!result.ref) result.ref = parent;
			process(parent, ctx, params);
			ctx.seen.get(parent).isParent = true;
		}
	}
	const meta = ctx.metadataRegistry.get(schema);
	if (meta) Object.assign(result.schema, meta);
	if (ctx.io === "input" && isTransforming(schema)) {
		delete result.schema.examples;
		delete result.schema.default;
	}
	if (ctx.io === "input" && "_prefault" in result.schema) (_a = result.schema).default ?? (_a.default = result.schema._prefault);
	delete result.schema._prefault;
	return ctx.seen.get(schema).schema;
}
function extractDefs(ctx, schema) {
	const root = ctx.seen.get(schema);
	if (!root) throw new Error("Unprocessed schema. This is a bug in Zod.");
	const idToSchema = /* @__PURE__ */ new Map();
	for (const entry of ctx.seen.entries()) {
		const id = ctx.metadataRegistry.get(entry[0])?.id;
		if (id) {
			const existing = idToSchema.get(id);
			if (existing && existing !== entry[0]) throw new Error(`Duplicate schema id "${id}" detected during JSON Schema conversion. Two different schemas cannot share the same id when converted together.`);
			idToSchema.set(id, entry[0]);
		}
	}
	const makeURI = (entry) => {
		const defsSegment = ctx.target === "draft-2020-12" ? "$defs" : "definitions";
		if (ctx.external) {
			const externalId = ctx.external.registry.get(entry[0])?.id;
			const uriGenerator = ctx.external.uri ?? ((id) => id);
			if (externalId) return { ref: uriGenerator(externalId) };
			const id = entry[1].defId ?? entry[1].schema.id ?? `schema${ctx.counter++}`;
			entry[1].defId = id;
			return {
				defId: id,
				ref: `${uriGenerator("__shared")}#/${defsSegment}/${id}`
			};
		}
		if (entry[1] === root) return { ref: "#" };
		const defUriPrefix = `#/${defsSegment}/`;
		const defId = entry[1].schema.id ?? `__schema${ctx.counter++}`;
		return {
			defId,
			ref: defUriPrefix + defId
		};
	};
	const extractToDef = (entry) => {
		if (entry[1].schema.$ref) return;
		const seen = entry[1];
		const { ref, defId } = makeURI(entry);
		seen.def = { ...seen.schema };
		if (defId) seen.defId = defId;
		const schema = seen.schema;
		for (const key in schema) delete schema[key];
		schema.$ref = ref;
	};
	if (ctx.cycles === "throw") for (const entry of ctx.seen.entries()) {
		const seen = entry[1];
		if (seen.cycle) throw new Error(`Cycle detected: #/${seen.cycle?.join("/")}/<root>

Set the \`cycles\` parameter to \`"ref"\` to resolve cyclical schemas with defs.`);
	}
	for (const entry of ctx.seen.entries()) {
		const seen = entry[1];
		if (schema === entry[0]) {
			extractToDef(entry);
			continue;
		}
		if (ctx.external) {
			const ext = ctx.external.registry.get(entry[0])?.id;
			if (schema !== entry[0] && ext) {
				extractToDef(entry);
				continue;
			}
		}
		if (ctx.metadataRegistry.get(entry[0])?.id) {
			extractToDef(entry);
			continue;
		}
		if (seen.cycle) {
			extractToDef(entry);
			continue;
		}
		if (seen.count > 1) {
			if (ctx.reused === "ref") {
				extractToDef(entry);
				continue;
			}
		}
	}
}
function finalize(ctx, schema) {
	const root = ctx.seen.get(schema);
	if (!root) throw new Error("Unprocessed schema. This is a bug in Zod.");
	const flattenRef = (zodSchema) => {
		const seen = ctx.seen.get(zodSchema);
		if (seen.ref === null) return;
		const schema = seen.def ?? seen.schema;
		const _cached = { ...schema };
		const ref = seen.ref;
		seen.ref = null;
		if (ref) {
			flattenRef(ref);
			const refSeen = ctx.seen.get(ref);
			const refSchema = refSeen.schema;
			if (refSchema.$ref && (ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0")) {
				schema.allOf = schema.allOf ?? [];
				schema.allOf.push(refSchema);
			} else Object.assign(schema, refSchema);
			Object.assign(schema, _cached);
			if (zodSchema._zod.parent === ref) for (const key in schema) {
				if (key === "$ref" || key === "allOf") continue;
				if (!(key in _cached)) delete schema[key];
			}
			if (refSchema.$ref && refSeen.def) for (const key in schema) {
				if (key === "$ref" || key === "allOf") continue;
				if (key in refSeen.def && JSON.stringify(schema[key]) === JSON.stringify(refSeen.def[key])) delete schema[key];
			}
		}
		const parent = zodSchema._zod.parent;
		if (parent && parent !== ref) {
			flattenRef(parent);
			const parentSeen = ctx.seen.get(parent);
			if (parentSeen?.schema.$ref) {
				schema.$ref = parentSeen.schema.$ref;
				if (parentSeen.def) for (const key in schema) {
					if (key === "$ref" || key === "allOf") continue;
					if (key in parentSeen.def && JSON.stringify(schema[key]) === JSON.stringify(parentSeen.def[key])) delete schema[key];
				}
			}
		}
		ctx.override({
			zodSchema,
			jsonSchema: schema,
			path: seen.path ?? []
		});
	};
	for (const entry of [...ctx.seen.entries()].reverse()) flattenRef(entry[0]);
	const result = {};
	if (ctx.target === "draft-2020-12") result.$schema = "https://json-schema.org/draft/2020-12/schema";
	else if (ctx.target === "draft-07") result.$schema = "http://json-schema.org/draft-07/schema#";
	else if (ctx.target === "draft-04") result.$schema = "http://json-schema.org/draft-04/schema#";
	else if (ctx.target === "openapi-3.0") {}
	if (ctx.external?.uri) {
		const id = ctx.external.registry.get(schema)?.id;
		if (!id) throw new Error("Schema is missing an `id` property");
		result.$id = ctx.external.uri(id);
	}
	Object.assign(result, root.def ?? root.schema);
	const rootMetaId = ctx.metadataRegistry.get(schema)?.id;
	if (rootMetaId !== void 0 && result.id === rootMetaId) delete result.id;
	const defs = ctx.external?.defs ?? {};
	for (const entry of ctx.seen.entries()) {
		const seen = entry[1];
		if (seen.def && seen.defId) {
			if (seen.def.id === seen.defId) delete seen.def.id;
			defs[seen.defId] = seen.def;
		}
	}
	if (ctx.external) {} else if (Object.keys(defs).length > 0) {
		if (ctx.target === "draft-2020-12") result.$defs = defs;
		else result.definitions = defs;
	}
	try {
		const finalized = JSON.parse(JSON.stringify(result));
		Object.defineProperty(finalized, "~standard", {
			value: {
				...schema["~standard"],
				jsonSchema: {
					input: createStandardJSONSchemaMethod(schema, "input", ctx.processors),
					output: createStandardJSONSchemaMethod(schema, "output", ctx.processors)
				}
			},
			enumerable: false,
			writable: false
		});
		return finalized;
	} catch (_err) {
		throw new Error("Error converting schema to JSON.");
	}
}
function isTransforming(_schema, _ctx) {
	const ctx = _ctx ?? { seen: /* @__PURE__ */ new Set() };
	if (ctx.seen.has(_schema)) return false;
	ctx.seen.add(_schema);
	const def = _schema._zod.def;
	if (def.type === "transform") return true;
	if (def.type === "array") return isTransforming(def.element, ctx);
	if (def.type === "set") return isTransforming(def.valueType, ctx);
	if (def.type === "lazy") return isTransforming(def.getter(), ctx);
	if (def.type === "promise" || def.type === "optional" || def.type === "nonoptional" || def.type === "nullable" || def.type === "readonly" || def.type === "default" || def.type === "prefault") return isTransforming(def.innerType, ctx);
	if (def.type === "intersection") return isTransforming(def.left, ctx) || isTransforming(def.right, ctx);
	if (def.type === "record" || def.type === "map") return isTransforming(def.keyType, ctx) || isTransforming(def.valueType, ctx);
	if (def.type === "pipe") {
		if (_schema._zod.traits.has("$ZodCodec")) return true;
		return isTransforming(def.in, ctx) || isTransforming(def.out, ctx);
	}
	if (def.type === "object") {
		for (const key in def.shape) if (isTransforming(def.shape[key], ctx)) return true;
		return false;
	}
	if (def.type === "union") {
		for (const option of def.options) if (isTransforming(option, ctx)) return true;
		return false;
	}
	if (def.type === "tuple") {
		for (const item of def.items) if (isTransforming(item, ctx)) return true;
		if (def.rest && isTransforming(def.rest, ctx)) return true;
		return false;
	}
	return false;
}
/**
* Creates a toJSONSchema method for a schema instance.
* This encapsulates the logic of initializing context, processing, extracting defs, and finalizing.
*/
const createToJSONSchemaMethod = (schema, processors = {}) => (params) => {
	const ctx = initializeContext({
		...params,
		processors
	});
	process(schema, ctx);
	extractDefs(ctx, schema);
	return finalize(ctx, schema);
};
const createStandardJSONSchemaMethod = (schema, io, processors = {}) => (params) => {
	const { libraryOptions, target } = params ?? {};
	const ctx = initializeContext({
		...libraryOptions ?? {},
		target,
		io,
		processors
	});
	process(schema, ctx);
	extractDefs(ctx, schema);
	return finalize(ctx, schema);
};
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/json-schema-processors.js
const formatMap = {
	guid: "uuid",
	url: "uri",
	datetime: "date-time",
	json_string: "json-string",
	regex: ""
};
const stringProcessor = (schema, ctx, _json, _params) => {
	const json = _json;
	json.type = "string";
	const { minimum, maximum, format, patterns, contentEncoding } = schema._zod.bag;
	if (typeof minimum === "number") json.minLength = minimum;
	if (typeof maximum === "number") json.maxLength = maximum;
	if (format) {
		json.format = formatMap[format] ?? format;
		if (json.format === "") delete json.format;
		if (format === "time") delete json.format;
	}
	if (contentEncoding) json.contentEncoding = contentEncoding;
	if (patterns && patterns.size > 0) {
		const regexes = [...patterns];
		if (regexes.length === 1) json.pattern = regexes[0].source;
		else if (regexes.length > 1) json.allOf = [...regexes.map((regex) => ({
			...ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0" ? { type: "string" } : {},
			pattern: regex.source
		}))];
	}
};
const numberProcessor = (schema, ctx, _json, _params) => {
	const json = _json;
	const { minimum, maximum, format, multipleOf, exclusiveMaximum, exclusiveMinimum } = schema._zod.bag;
	if (typeof format === "string" && format.includes("int")) json.type = "integer";
	else json.type = "number";
	const exMin = typeof exclusiveMinimum === "number" && exclusiveMinimum >= (minimum ?? Number.NEGATIVE_INFINITY);
	const exMax = typeof exclusiveMaximum === "number" && exclusiveMaximum <= (maximum ?? Number.POSITIVE_INFINITY);
	const legacy = ctx.target === "draft-04" || ctx.target === "openapi-3.0";
	if (exMin) {
		if (legacy) {
			json.minimum = exclusiveMinimum;
			json.exclusiveMinimum = true;
		} else json.exclusiveMinimum = exclusiveMinimum;
	} else if (typeof minimum === "number") json.minimum = minimum;
	if (exMax) {
		if (legacy) {
			json.maximum = exclusiveMaximum;
			json.exclusiveMaximum = true;
		} else json.exclusiveMaximum = exclusiveMaximum;
	} else if (typeof maximum === "number") json.maximum = maximum;
	if (typeof multipleOf === "number") json.multipleOf = multipleOf;
};
const booleanProcessor = (_schema, _ctx, json, _params) => {
	json.type = "boolean";
};
const undefinedProcessor = (_schema, ctx, _json, _params) => {
	if (ctx.unrepresentable === "throw") throw new Error("Undefined cannot be represented in JSON Schema");
};
const voidProcessor = (_schema, ctx, _json, _params) => {
	if (ctx.unrepresentable === "throw") throw new Error("Void cannot be represented in JSON Schema");
};
const neverProcessor = (_schema, _ctx, json, _params) => {
	json.not = {};
};
const enumProcessor = (schema, _ctx, json, _params) => {
	const def = schema._zod.def;
	const values = getEnumValues(def.entries);
	if (values.every((v) => typeof v === "number")) json.type = "number";
	if (values.every((v) => typeof v === "string")) json.type = "string";
	json.enum = values;
};
const literalProcessor = (schema, ctx, json, _params) => {
	const def = schema._zod.def;
	const vals = [];
	for (const val of def.values) if (val === void 0) {
		if (ctx.unrepresentable === "throw") throw new Error("Literal `undefined` cannot be represented in JSON Schema");
	} else if (typeof val === "bigint") {
		if (ctx.unrepresentable === "throw") throw new Error("BigInt literals cannot be represented in JSON Schema");
		else vals.push(Number(val));
	} else vals.push(val);
	if (vals.length === 0) {} else if (vals.length === 1) {
		const val = vals[0];
		json.type = val === null ? "null" : typeof val;
		if (ctx.target === "draft-04" || ctx.target === "openapi-3.0") json.enum = [val];
		else json.const = val;
	} else {
		if (vals.every((v) => typeof v === "number")) json.type = "number";
		if (vals.every((v) => typeof v === "string")) json.type = "string";
		if (vals.every((v) => typeof v === "boolean")) json.type = "boolean";
		if (vals.every((v) => v === null)) json.type = "null";
		json.enum = vals;
	}
};
const customProcessor = (_schema, ctx, _json, _params) => {
	if (ctx.unrepresentable === "throw") throw new Error("Custom types cannot be represented in JSON Schema");
};
const transformProcessor = (_schema, ctx, _json, _params) => {
	if (ctx.unrepresentable === "throw") throw new Error("Transforms cannot be represented in JSON Schema");
};
const arrayProcessor = (schema, ctx, _json, params) => {
	const json = _json;
	const def = schema._zod.def;
	const { minimum, maximum } = schema._zod.bag;
	if (typeof minimum === "number") json.minItems = minimum;
	if (typeof maximum === "number") json.maxItems = maximum;
	json.type = "array";
	json.items = process(def.element, ctx, {
		...params,
		path: [...params.path, "items"]
	});
};
const objectProcessor = (schema, ctx, _json, params) => {
	const json = _json;
	const def = schema._zod.def;
	json.type = "object";
	json.properties = {};
	const shape = def.shape;
	for (const key in shape) json.properties[key] = process(shape[key], ctx, {
		...params,
		path: [
			...params.path,
			"properties",
			key
		]
	});
	const allKeys = new Set(Object.keys(shape));
	const requiredKeys = new Set([...allKeys].filter((key) => {
		const v = def.shape[key]._zod;
		if (ctx.io === "input") return v.optin === void 0;
		else return v.optout === void 0;
	}));
	if (requiredKeys.size > 0) json.required = Array.from(requiredKeys);
	if (def.catchall?._zod.def.type === "never") json.additionalProperties = false;
	else if (!def.catchall) {
		if (ctx.io === "output") json.additionalProperties = false;
	} else if (def.catchall) json.additionalProperties = process(def.catchall, ctx, {
		...params,
		path: [...params.path, "additionalProperties"]
	});
};
const unionProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	const isExclusive = def.inclusive === false;
	const options = def.options.map((x, i) => process(x, ctx, {
		...params,
		path: [
			...params.path,
			isExclusive ? "oneOf" : "anyOf",
			i
		]
	}));
	if (isExclusive) json.oneOf = options;
	else json.anyOf = options;
};
const intersectionProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	const a = process(def.left, ctx, {
		...params,
		path: [
			...params.path,
			"allOf",
			0
		]
	});
	const b = process(def.right, ctx, {
		...params,
		path: [
			...params.path,
			"allOf",
			1
		]
	});
	const isSimpleIntersection = (val) => "allOf" in val && Object.keys(val).length === 1;
	json.allOf = [...isSimpleIntersection(a) ? a.allOf : [a], ...isSimpleIntersection(b) ? b.allOf : [b]];
};
const nullableProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	const inner = process(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	if (ctx.target === "openapi-3.0") {
		seen.ref = def.innerType;
		json.nullable = true;
	} else json.anyOf = [inner, { type: "null" }];
};
const nonoptionalProcessor = (schema, ctx, _json, params) => {
	const def = schema._zod.def;
	process(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = def.innerType;
};
const defaultProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	process(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = def.innerType;
	json.default = JSON.parse(JSON.stringify(def.defaultValue));
};
const prefaultProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	process(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = def.innerType;
	if (ctx.io === "input") json._prefault = JSON.parse(JSON.stringify(def.defaultValue));
};
const catchProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	process(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = def.innerType;
	let catchValue;
	try {
		catchValue = def.catchValue(void 0);
	} catch {
		throw new Error("Dynamic catch values are not supported in JSON Schema");
	}
	json.default = catchValue;
};
const pipeProcessor = (schema, ctx, _json, params) => {
	const def = schema._zod.def;
	const inIsTransform = def.in._zod.traits.has("$ZodTransform");
	const innerType = ctx.io === "input" ? inIsTransform ? def.out : def.in : def.out;
	process(innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = innerType;
};
const readonlyProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	process(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = def.innerType;
	json.readOnly = true;
};
const optionalProcessor = (schema, ctx, _json, params) => {
	const def = schema._zod.def;
	process(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = def.innerType;
};
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/iso.js
const ZodISODateTime = /*@__PURE__*/ $constructor("ZodISODateTime", (inst, def) => {
	$ZodISODateTime.init(inst, def);
	ZodStringFormat.init(inst, def);
});
function datetime(params) {
	return /* @__PURE__ */ _isoDateTime(ZodISODateTime, params);
}
const ZodISODate = /*@__PURE__*/ $constructor("ZodISODate", (inst, def) => {
	$ZodISODate.init(inst, def);
	ZodStringFormat.init(inst, def);
});
function date(params) {
	return /* @__PURE__ */ _isoDate(ZodISODate, params);
}
const ZodISOTime = /*@__PURE__*/ $constructor("ZodISOTime", (inst, def) => {
	$ZodISOTime.init(inst, def);
	ZodStringFormat.init(inst, def);
});
function time(params) {
	return /* @__PURE__ */ _isoTime(ZodISOTime, params);
}
const ZodISODuration = /*@__PURE__*/ $constructor("ZodISODuration", (inst, def) => {
	$ZodISODuration.init(inst, def);
	ZodStringFormat.init(inst, def);
});
function duration(params) {
	return /* @__PURE__ */ _isoDuration(ZodISODuration, params);
}
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/errors.js
const initializer = (inst, issues) => {
	$ZodError.init(inst, issues);
	inst.name = "ZodError";
	Object.defineProperties(inst, {
		format: { value: (mapper) => formatError(inst, mapper) },
		flatten: { value: (mapper) => flattenError(inst, mapper) },
		addIssue: { value: (issue) => {
			inst.issues.push(issue);
			inst.message = JSON.stringify(inst.issues, jsonStringifyReplacer, 2);
		} },
		addIssues: { value: (issues) => {
			inst.issues.push(...issues);
			inst.message = JSON.stringify(inst.issues, jsonStringifyReplacer, 2);
		} },
		isEmpty: { get() {
			return inst.issues.length === 0;
		} }
	});
};
const ZodRealError = /*@__PURE__*/ $constructor("ZodError", initializer, { Parent: Error });
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/parse.js
const parse = /* @__PURE__ */ _parse(ZodRealError);
const parseAsync = /* @__PURE__ */ _parseAsync(ZodRealError);
const safeParse = /* @__PURE__ */ _safeParse(ZodRealError);
const safeParseAsync = /* @__PURE__ */ _safeParseAsync(ZodRealError);
const encode = /* @__PURE__ */ _encode(ZodRealError);
const decode = /* @__PURE__ */ _decode(ZodRealError);
const encodeAsync = /* @__PURE__ */ _encodeAsync(ZodRealError);
const decodeAsync = /* @__PURE__ */ _decodeAsync(ZodRealError);
const safeEncode = /* @__PURE__ */ _safeEncode(ZodRealError);
const safeDecode = /* @__PURE__ */ _safeDecode(ZodRealError);
const safeEncodeAsync = /* @__PURE__ */ _safeEncodeAsync(ZodRealError);
const safeDecodeAsync = /* @__PURE__ */ _safeDecodeAsync(ZodRealError);
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/schemas.js
const _installedGroups = /* @__PURE__ */ new WeakMap();
function _installLazyMethods(inst, group, methods) {
	const proto = Object.getPrototypeOf(inst);
	let installed = _installedGroups.get(proto);
	if (!installed) {
		installed = /* @__PURE__ */ new Set();
		_installedGroups.set(proto, installed);
	}
	if (installed.has(group)) return;
	installed.add(group);
	for (const key in methods) {
		const fn = methods[key];
		Object.defineProperty(proto, key, {
			configurable: true,
			enumerable: false,
			get() {
				const bound = fn.bind(this);
				Object.defineProperty(this, key, {
					configurable: true,
					writable: true,
					enumerable: true,
					value: bound
				});
				return bound;
			},
			set(v) {
				Object.defineProperty(this, key, {
					configurable: true,
					writable: true,
					enumerable: true,
					value: v
				});
			}
		});
	}
}
const ZodType = /*@__PURE__*/ $constructor("ZodType", (inst, def) => {
	$ZodType.init(inst, def);
	Object.assign(inst["~standard"], { jsonSchema: {
		input: createStandardJSONSchemaMethod(inst, "input"),
		output: createStandardJSONSchemaMethod(inst, "output")
	} });
	inst.toJSONSchema = createToJSONSchemaMethod(inst, {});
	inst.def = def;
	inst.type = def.type;
	Object.defineProperty(inst, "_def", { value: def });
	inst.parse = (data, params) => parse(inst, data, params, { callee: inst.parse });
	inst.safeParse = (data, params) => safeParse(inst, data, params);
	inst.parseAsync = async (data, params) => parseAsync(inst, data, params, { callee: inst.parseAsync });
	inst.safeParseAsync = async (data, params) => safeParseAsync(inst, data, params);
	inst.spa = inst.safeParseAsync;
	inst.encode = (data, params) => encode(inst, data, params);
	inst.decode = (data, params) => decode(inst, data, params);
	inst.encodeAsync = async (data, params) => encodeAsync(inst, data, params);
	inst.decodeAsync = async (data, params) => decodeAsync(inst, data, params);
	inst.safeEncode = (data, params) => safeEncode(inst, data, params);
	inst.safeDecode = (data, params) => safeDecode(inst, data, params);
	inst.safeEncodeAsync = async (data, params) => safeEncodeAsync(inst, data, params);
	inst.safeDecodeAsync = async (data, params) => safeDecodeAsync(inst, data, params);
	_installLazyMethods(inst, "ZodType", {
		check(...chks) {
			const def = this.def;
			return this.clone(mergeDefs(def, { checks: [...def.checks ?? [], ...chks.map((ch) => typeof ch === "function" ? { _zod: {
				check: ch,
				def: { check: "custom" },
				onattach: []
			} } : ch)] }), { parent: true });
		},
		with(...chks) {
			return this.check(...chks);
		},
		clone(def, params) {
			return clone(this, def, params);
		},
		brand() {
			return this;
		},
		register(reg, meta) {
			reg.add(this, meta);
			return this;
		},
		refine(check, params) {
			return this.check(refine(check, params));
		},
		superRefine(refinement, params) {
			return this.check(superRefine(refinement, params));
		},
		overwrite(fn) {
			return this.check(/* @__PURE__ */ _overwrite(fn));
		},
		optional() {
			return optional(this);
		},
		exactOptional() {
			return exactOptional(this);
		},
		nullable() {
			return nullable(this);
		},
		nullish() {
			return optional(nullable(this));
		},
		nonoptional(params) {
			return nonoptional(this, params);
		},
		array() {
			return array(this);
		},
		or(arg) {
			return union([this, arg]);
		},
		and(arg) {
			return intersection(this, arg);
		},
		transform(tx) {
			return pipe(this, transform(tx));
		},
		default(d) {
			return _default(this, d);
		},
		prefault(d) {
			return prefault(this, d);
		},
		catch(params) {
			return _catch(this, params);
		},
		pipe(target) {
			return pipe(this, target);
		},
		readonly() {
			return readonly(this);
		},
		describe(description) {
			const cl = this.clone();
			globalRegistry.add(cl, { description });
			return cl;
		},
		meta(...args) {
			if (args.length === 0) return globalRegistry.get(this);
			const cl = this.clone();
			globalRegistry.add(cl, args[0]);
			return cl;
		},
		isOptional() {
			return this.safeParse(void 0).success;
		},
		isNullable() {
			return this.safeParse(null).success;
		},
		apply(fn) {
			return fn(this);
		}
	});
	Object.defineProperty(inst, "description", {
		get() {
			return globalRegistry.get(inst)?.description;
		},
		configurable: true
	});
	return inst;
});
/** @internal */
const _ZodString = /*@__PURE__*/ $constructor("_ZodString", (inst, def) => {
	$ZodString.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => stringProcessor(inst, ctx, json, params);
	const bag = inst._zod.bag;
	inst.format = bag.format ?? null;
	inst.minLength = bag.minimum ?? null;
	inst.maxLength = bag.maximum ?? null;
	_installLazyMethods(inst, "_ZodString", {
		regex(...args) {
			return this.check(/* @__PURE__ */ _regex(...args));
		},
		includes(...args) {
			return this.check(/* @__PURE__ */ _includes(...args));
		},
		startsWith(...args) {
			return this.check(/* @__PURE__ */ _startsWith(...args));
		},
		endsWith(...args) {
			return this.check(/* @__PURE__ */ _endsWith(...args));
		},
		min(...args) {
			return this.check(/* @__PURE__ */ _minLength(...args));
		},
		max(...args) {
			return this.check(/* @__PURE__ */ _maxLength(...args));
		},
		length(...args) {
			return this.check(/* @__PURE__ */ _length(...args));
		},
		nonempty(...args) {
			return this.check(/* @__PURE__ */ _minLength(1, ...args));
		},
		lowercase(params) {
			return this.check(/* @__PURE__ */ _lowercase(params));
		},
		uppercase(params) {
			return this.check(/* @__PURE__ */ _uppercase(params));
		},
		trim() {
			return this.check(/* @__PURE__ */ _trim());
		},
		normalize(...args) {
			return this.check(/* @__PURE__ */ _normalize(...args));
		},
		toLowerCase() {
			return this.check(/* @__PURE__ */ _toLowerCase());
		},
		toUpperCase() {
			return this.check(/* @__PURE__ */ _toUpperCase());
		},
		slugify() {
			return this.check(/* @__PURE__ */ _slugify());
		}
	});
});
const ZodString = /*@__PURE__*/ $constructor("ZodString", (inst, def) => {
	$ZodString.init(inst, def);
	_ZodString.init(inst, def);
	inst.email = (params) => inst.check(/* @__PURE__ */ _email(ZodEmail, params));
	inst.url = (params) => inst.check(/* @__PURE__ */ _url(ZodURL, params));
	inst.jwt = (params) => inst.check(/* @__PURE__ */ _jwt(ZodJWT, params));
	inst.emoji = (params) => inst.check(/* @__PURE__ */ _emoji(ZodEmoji, params));
	inst.guid = (params) => inst.check(/* @__PURE__ */ _guid(ZodGUID, params));
	inst.uuid = (params) => inst.check(/* @__PURE__ */ _uuid(ZodUUID, params));
	inst.uuidv4 = (params) => inst.check(/* @__PURE__ */ _uuidv4(ZodUUID, params));
	inst.uuidv6 = (params) => inst.check(/* @__PURE__ */ _uuidv6(ZodUUID, params));
	inst.uuidv7 = (params) => inst.check(/* @__PURE__ */ _uuidv7(ZodUUID, params));
	inst.nanoid = (params) => inst.check(/* @__PURE__ */ _nanoid(ZodNanoID, params));
	inst.guid = (params) => inst.check(/* @__PURE__ */ _guid(ZodGUID, params));
	inst.cuid = (params) => inst.check(/* @__PURE__ */ _cuid(ZodCUID, params));
	inst.cuid2 = (params) => inst.check(/* @__PURE__ */ _cuid2(ZodCUID2, params));
	inst.ulid = (params) => inst.check(/* @__PURE__ */ _ulid(ZodULID, params));
	inst.base64 = (params) => inst.check(/* @__PURE__ */ _base64(ZodBase64, params));
	inst.base64url = (params) => inst.check(/* @__PURE__ */ _base64url(ZodBase64URL, params));
	inst.xid = (params) => inst.check(/* @__PURE__ */ _xid(ZodXID, params));
	inst.ksuid = (params) => inst.check(/* @__PURE__ */ _ksuid(ZodKSUID, params));
	inst.ipv4 = (params) => inst.check(/* @__PURE__ */ _ipv4(ZodIPv4, params));
	inst.ipv6 = (params) => inst.check(/* @__PURE__ */ _ipv6(ZodIPv6, params));
	inst.cidrv4 = (params) => inst.check(/* @__PURE__ */ _cidrv4(ZodCIDRv4, params));
	inst.cidrv6 = (params) => inst.check(/* @__PURE__ */ _cidrv6(ZodCIDRv6, params));
	inst.e164 = (params) => inst.check(/* @__PURE__ */ _e164(ZodE164, params));
	inst.datetime = (params) => inst.check(datetime(params));
	inst.date = (params) => inst.check(date(params));
	inst.time = (params) => inst.check(time(params));
	inst.duration = (params) => inst.check(duration(params));
});
function string(params) {
	return /* @__PURE__ */ _string(ZodString, params);
}
const ZodStringFormat = /*@__PURE__*/ $constructor("ZodStringFormat", (inst, def) => {
	$ZodStringFormat.init(inst, def);
	_ZodString.init(inst, def);
});
const ZodEmail = /*@__PURE__*/ $constructor("ZodEmail", (inst, def) => {
	$ZodEmail.init(inst, def);
	ZodStringFormat.init(inst, def);
});
const ZodGUID = /*@__PURE__*/ $constructor("ZodGUID", (inst, def) => {
	$ZodGUID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
const ZodUUID = /*@__PURE__*/ $constructor("ZodUUID", (inst, def) => {
	$ZodUUID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
const ZodURL = /*@__PURE__*/ $constructor("ZodURL", (inst, def) => {
	$ZodURL.init(inst, def);
	ZodStringFormat.init(inst, def);
});
const ZodEmoji = /*@__PURE__*/ $constructor("ZodEmoji", (inst, def) => {
	$ZodEmoji.init(inst, def);
	ZodStringFormat.init(inst, def);
});
const ZodNanoID = /*@__PURE__*/ $constructor("ZodNanoID", (inst, def) => {
	$ZodNanoID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
/**
* @deprecated CUID v1 is deprecated by its authors due to information leakage
* (timestamps embedded in the id). Use {@link ZodCUID2} instead.
* See https://github.com/paralleldrive/cuid.
*/
const ZodCUID = /*@__PURE__*/ $constructor("ZodCUID", (inst, def) => {
	$ZodCUID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
const ZodCUID2 = /*@__PURE__*/ $constructor("ZodCUID2", (inst, def) => {
	$ZodCUID2.init(inst, def);
	ZodStringFormat.init(inst, def);
});
const ZodULID = /*@__PURE__*/ $constructor("ZodULID", (inst, def) => {
	$ZodULID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
const ZodXID = /*@__PURE__*/ $constructor("ZodXID", (inst, def) => {
	$ZodXID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
const ZodKSUID = /*@__PURE__*/ $constructor("ZodKSUID", (inst, def) => {
	$ZodKSUID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
const ZodIPv4 = /*@__PURE__*/ $constructor("ZodIPv4", (inst, def) => {
	$ZodIPv4.init(inst, def);
	ZodStringFormat.init(inst, def);
});
const ZodIPv6 = /*@__PURE__*/ $constructor("ZodIPv6", (inst, def) => {
	$ZodIPv6.init(inst, def);
	ZodStringFormat.init(inst, def);
});
const ZodCIDRv4 = /*@__PURE__*/ $constructor("ZodCIDRv4", (inst, def) => {
	$ZodCIDRv4.init(inst, def);
	ZodStringFormat.init(inst, def);
});
const ZodCIDRv6 = /*@__PURE__*/ $constructor("ZodCIDRv6", (inst, def) => {
	$ZodCIDRv6.init(inst, def);
	ZodStringFormat.init(inst, def);
});
const ZodBase64 = /*@__PURE__*/ $constructor("ZodBase64", (inst, def) => {
	$ZodBase64.init(inst, def);
	ZodStringFormat.init(inst, def);
});
const ZodBase64URL = /*@__PURE__*/ $constructor("ZodBase64URL", (inst, def) => {
	$ZodBase64URL.init(inst, def);
	ZodStringFormat.init(inst, def);
});
const ZodE164 = /*@__PURE__*/ $constructor("ZodE164", (inst, def) => {
	$ZodE164.init(inst, def);
	ZodStringFormat.init(inst, def);
});
const ZodJWT = /*@__PURE__*/ $constructor("ZodJWT", (inst, def) => {
	$ZodJWT.init(inst, def);
	ZodStringFormat.init(inst, def);
});
const ZodNumber = /*@__PURE__*/ $constructor("ZodNumber", (inst, def) => {
	$ZodNumber.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => numberProcessor(inst, ctx, json, params);
	_installLazyMethods(inst, "ZodNumber", {
		gt(value, params) {
			return this.check(/* @__PURE__ */ _gt(value, params));
		},
		gte(value, params) {
			return this.check(/* @__PURE__ */ _gte(value, params));
		},
		min(value, params) {
			return this.check(/* @__PURE__ */ _gte(value, params));
		},
		lt(value, params) {
			return this.check(/* @__PURE__ */ _lt(value, params));
		},
		lte(value, params) {
			return this.check(/* @__PURE__ */ _lte(value, params));
		},
		max(value, params) {
			return this.check(/* @__PURE__ */ _lte(value, params));
		},
		int(params) {
			return this.check(int(params));
		},
		safe(params) {
			return this.check(int(params));
		},
		positive(params) {
			return this.check(/* @__PURE__ */ _gt(0, params));
		},
		nonnegative(params) {
			return this.check(/* @__PURE__ */ _gte(0, params));
		},
		negative(params) {
			return this.check(/* @__PURE__ */ _lt(0, params));
		},
		nonpositive(params) {
			return this.check(/* @__PURE__ */ _lte(0, params));
		},
		multipleOf(value, params) {
			return this.check(/* @__PURE__ */ _multipleOf(value, params));
		},
		step(value, params) {
			return this.check(/* @__PURE__ */ _multipleOf(value, params));
		},
		finite() {
			return this;
		}
	});
	const bag = inst._zod.bag;
	inst.minValue = Math.max(bag.minimum ?? Number.NEGATIVE_INFINITY, bag.exclusiveMinimum ?? Number.NEGATIVE_INFINITY) ?? null;
	inst.maxValue = Math.min(bag.maximum ?? Number.POSITIVE_INFINITY, bag.exclusiveMaximum ?? Number.POSITIVE_INFINITY) ?? null;
	inst.isInt = (bag.format ?? "").includes("int") || Number.isSafeInteger(bag.multipleOf ?? .5);
	inst.isFinite = true;
	inst.format = bag.format ?? null;
});
function number(params) {
	return /* @__PURE__ */ _number(ZodNumber, params);
}
const ZodNumberFormat = /*@__PURE__*/ $constructor("ZodNumberFormat", (inst, def) => {
	$ZodNumberFormat.init(inst, def);
	ZodNumber.init(inst, def);
});
function int(params) {
	return /* @__PURE__ */ _int(ZodNumberFormat, params);
}
const ZodBoolean = /*@__PURE__*/ $constructor("ZodBoolean", (inst, def) => {
	$ZodBoolean.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => booleanProcessor(inst, ctx, json, params);
});
function boolean(params) {
	return /* @__PURE__ */ _boolean(ZodBoolean, params);
}
const ZodUndefined = /*@__PURE__*/ $constructor("ZodUndefined", (inst, def) => {
	$ZodUndefined.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => undefinedProcessor(inst, ctx, json, params);
});
function _undefined(params) {
	return /* @__PURE__ */ _undefined$1(ZodUndefined, params);
}
const ZodUnknown = /*@__PURE__*/ $constructor("ZodUnknown", (inst, def) => {
	$ZodUnknown.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => void 0;
});
function unknown() {
	return /* @__PURE__ */ _unknown(ZodUnknown);
}
const ZodNever = /*@__PURE__*/ $constructor("ZodNever", (inst, def) => {
	$ZodNever.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => neverProcessor(inst, ctx, json, params);
});
function never(params) {
	return /* @__PURE__ */ _never(ZodNever, params);
}
const ZodVoid = /*@__PURE__*/ $constructor("ZodVoid", (inst, def) => {
	$ZodVoid.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => voidProcessor(inst, ctx, json, params);
});
function _void(params) {
	return /* @__PURE__ */ _void$1(ZodVoid, params);
}
const ZodArray = /*@__PURE__*/ $constructor("ZodArray", (inst, def) => {
	$ZodArray.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => arrayProcessor(inst, ctx, json, params);
	inst.element = def.element;
	_installLazyMethods(inst, "ZodArray", {
		min(n, params) {
			return this.check(/* @__PURE__ */ _minLength(n, params));
		},
		nonempty(params) {
			return this.check(/* @__PURE__ */ _minLength(1, params));
		},
		max(n, params) {
			return this.check(/* @__PURE__ */ _maxLength(n, params));
		},
		length(n, params) {
			return this.check(/* @__PURE__ */ _length(n, params));
		},
		unwrap() {
			return this.element;
		}
	});
});
function array(element, params) {
	return /* @__PURE__ */ _array(ZodArray, element, params);
}
const ZodObject = /*@__PURE__*/ $constructor("ZodObject", (inst, def) => {
	$ZodObjectJIT.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => objectProcessor(inst, ctx, json, params);
	defineLazy(inst, "shape", () => {
		return def.shape;
	});
	_installLazyMethods(inst, "ZodObject", {
		keyof() {
			return _enum(Object.keys(this._zod.def.shape));
		},
		catchall(catchall) {
			return this.clone({
				...this._zod.def,
				catchall
			});
		},
		passthrough() {
			return this.clone({
				...this._zod.def,
				catchall: unknown()
			});
		},
		loose() {
			return this.clone({
				...this._zod.def,
				catchall: unknown()
			});
		},
		strict() {
			return this.clone({
				...this._zod.def,
				catchall: never()
			});
		},
		strip() {
			return this.clone({
				...this._zod.def,
				catchall: void 0
			});
		},
		extend(incoming) {
			return extend(this, incoming);
		},
		safeExtend(incoming) {
			return safeExtend(this, incoming);
		},
		merge(other) {
			return merge(this, other);
		},
		pick(mask) {
			return pick(this, mask);
		},
		omit(mask) {
			return omit(this, mask);
		},
		partial(...args) {
			return partial(ZodOptional, this, args[0]);
		},
		required(...args) {
			return required(ZodNonOptional, this, args[0]);
		}
	});
});
function object(shape, params) {
	const def = {
		type: "object",
		shape: shape ?? {},
		...normalizeParams(params)
	};
	return new ZodObject(def);
}
const ZodUnion = /*@__PURE__*/ $constructor("ZodUnion", (inst, def) => {
	$ZodUnion.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => unionProcessor(inst, ctx, json, params);
	inst.options = def.options;
});
function union(options, params) {
	return new ZodUnion({
		type: "union",
		options,
		...normalizeParams(params)
	});
}
const ZodIntersection = /*@__PURE__*/ $constructor("ZodIntersection", (inst, def) => {
	$ZodIntersection.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => intersectionProcessor(inst, ctx, json, params);
});
function intersection(left, right) {
	return new ZodIntersection({
		type: "intersection",
		left,
		right
	});
}
const ZodEnum = /*@__PURE__*/ $constructor("ZodEnum", (inst, def) => {
	$ZodEnum.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => enumProcessor(inst, ctx, json, params);
	inst.enum = def.entries;
	inst.options = Object.values(def.entries);
	const keys = new Set(Object.keys(def.entries));
	inst.extract = (values, params) => {
		const newEntries = {};
		for (const value of values) if (keys.has(value)) newEntries[value] = def.entries[value];
		else throw new Error(`Key ${value} not found in enum`);
		return new ZodEnum({
			...def,
			checks: [],
			...normalizeParams(params),
			entries: newEntries
		});
	};
	inst.exclude = (values, params) => {
		const newEntries = { ...def.entries };
		for (const value of values) if (keys.has(value)) delete newEntries[value];
		else throw new Error(`Key ${value} not found in enum`);
		return new ZodEnum({
			...def,
			checks: [],
			...normalizeParams(params),
			entries: newEntries
		});
	};
});
function _enum(values, params) {
	const entries = Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values;
	return new ZodEnum({
		type: "enum",
		entries,
		...normalizeParams(params)
	});
}
const ZodLiteral = /*@__PURE__*/ $constructor("ZodLiteral", (inst, def) => {
	$ZodLiteral.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => literalProcessor(inst, ctx, json, params);
	inst.values = new Set(def.values);
	Object.defineProperty(inst, "value", { get() {
		if (def.values.length > 1) throw new Error("This schema contains multiple valid literal values. Use `.values` instead.");
		return def.values[0];
	} });
});
function literal(value, params) {
	return new ZodLiteral({
		type: "literal",
		values: Array.isArray(value) ? value : [value],
		...normalizeParams(params)
	});
}
const ZodTransform = /*@__PURE__*/ $constructor("ZodTransform", (inst, def) => {
	$ZodTransform.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => transformProcessor(inst, ctx, json, params);
	inst._zod.parse = (payload, _ctx) => {
		if (_ctx.direction === "backward") throw new $ZodEncodeError(inst.constructor.name);
		payload.addIssue = (issue$1) => {
			if (typeof issue$1 === "string") payload.issues.push(issue(issue$1, payload.value, def));
			else {
				const _issue = issue$1;
				if (_issue.fatal) _issue.continue = false;
				_issue.code ?? (_issue.code = "custom");
				_issue.input ?? (_issue.input = payload.value);
				_issue.inst ?? (_issue.inst = inst);
				payload.issues.push(issue(_issue));
			}
		};
		const output = def.transform(payload.value, payload);
		if (output instanceof Promise) return output.then((output) => {
			payload.value = output;
			payload.fallback = true;
			return payload;
		});
		payload.value = output;
		payload.fallback = true;
		return payload;
	};
});
function transform(fn) {
	return new ZodTransform({
		type: "transform",
		transform: fn
	});
}
const ZodOptional = /*@__PURE__*/ $constructor("ZodOptional", (inst, def) => {
	$ZodOptional.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
});
function optional(innerType) {
	return new ZodOptional({
		type: "optional",
		innerType
	});
}
const ZodExactOptional = /*@__PURE__*/ $constructor("ZodExactOptional", (inst, def) => {
	$ZodExactOptional.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
});
function exactOptional(innerType) {
	return new ZodExactOptional({
		type: "optional",
		innerType
	});
}
const ZodNullable = /*@__PURE__*/ $constructor("ZodNullable", (inst, def) => {
	$ZodNullable.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => nullableProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
});
function nullable(innerType) {
	return new ZodNullable({
		type: "nullable",
		innerType
	});
}
const ZodDefault = /*@__PURE__*/ $constructor("ZodDefault", (inst, def) => {
	$ZodDefault.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => defaultProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
	inst.removeDefault = inst.unwrap;
});
function _default(innerType, defaultValue) {
	return new ZodDefault({
		type: "default",
		innerType,
		get defaultValue() {
			return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
		}
	});
}
const ZodPrefault = /*@__PURE__*/ $constructor("ZodPrefault", (inst, def) => {
	$ZodPrefault.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => prefaultProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
});
function prefault(innerType, defaultValue) {
	return new ZodPrefault({
		type: "prefault",
		innerType,
		get defaultValue() {
			return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
		}
	});
}
const ZodNonOptional = /*@__PURE__*/ $constructor("ZodNonOptional", (inst, def) => {
	$ZodNonOptional.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => nonoptionalProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
});
function nonoptional(innerType, params) {
	return new ZodNonOptional({
		type: "nonoptional",
		innerType,
		...normalizeParams(params)
	});
}
const ZodCatch = /*@__PURE__*/ $constructor("ZodCatch", (inst, def) => {
	$ZodCatch.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => catchProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
	inst.removeCatch = inst.unwrap;
});
function _catch(innerType, catchValue) {
	return new ZodCatch({
		type: "catch",
		innerType,
		catchValue: typeof catchValue === "function" ? catchValue : () => catchValue
	});
}
const ZodPipe = /*@__PURE__*/ $constructor("ZodPipe", (inst, def) => {
	$ZodPipe.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => pipeProcessor(inst, ctx, json, params);
	inst.in = def.in;
	inst.out = def.out;
});
function pipe(in_, out) {
	return new ZodPipe({
		type: "pipe",
		in: in_,
		out
	});
}
const ZodReadonly = /*@__PURE__*/ $constructor("ZodReadonly", (inst, def) => {
	$ZodReadonly.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => readonlyProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
});
function readonly(innerType) {
	return new ZodReadonly({
		type: "readonly",
		innerType
	});
}
const ZodCustom = /*@__PURE__*/ $constructor("ZodCustom", (inst, def) => {
	$ZodCustom.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => customProcessor(inst, ctx, json, params);
});
function refine(fn, _params = {}) {
	return /* @__PURE__ */ _refine(ZodCustom, fn, _params);
}
function superRefine(fn, params) {
	return /* @__PURE__ */ _superRefine(fn, params);
}
//#endregion
//#region lib/typert.remote-client.js
const _wolffycode_dsh_engine_suite_engineSuiteGateway_cancelAgent_parameter_0$schema = string();
const _wolffycode_dsh_engine_suite_engineSuiteGateway_cancelAgent_result$schema = _void();
const _wolffycode_dsh_engine_suite_engineSuiteGateway_catalog_result$schema = object({
	"engines": array(object({
		"id": string().readonly(),
		"type": string().readonly(),
		"displayName": string().readonly(),
		"capabilities": object({
			"streaming": boolean().readonly(),
			"sessionResume": boolean().readonly(),
			"modelDiscovery": boolean().readonly(),
			"reasoningDiscovery": boolean().readonly(),
			"approvals": boolean().readonly(),
			"mcp": boolean().readonly(),
			"skills": boolean().readonly(),
			"backgroundAgent": boolean().readonly(),
			"steer": boolean().readonly(),
			"fork": boolean().readonly()
		}).readonly()
	})).readonly(),
	"providers": array(object({
		"id": string().readonly(),
		"engineId": string().readonly(),
		"name": string().readonly(),
		"baseUri": string().readonly(),
		"wireApi": string().readonly(),
		"authMode": string().readonly(),
		"enabled": boolean().readonly(),
		"status": string().readonly()
	})).readonly(),
	"models": array(object({
		"id": string().readonly(),
		"engineId": string().readonly(),
		"providerId": string().readonly(),
		"modelId": string().readonly(),
		"displayName": union([_undefined(), string()]).readonly().optional(),
		"description": union([_undefined(), string()]).readonly().optional(),
		"enabled": boolean().readonly(),
		"hidden": boolean().readonly(),
		"reasoningOptions": array(object({
			"id": string().readonly(),
			"description": union([_undefined(), string()]).readonly().optional()
		})).readonly(),
		"defaultReasoningEffort": union([_undefined(), string()]).readonly().optional(),
		"inputModalities": array(string()).readonly(),
		"contextWindowTokens": union([_undefined(), number()]).readonly().optional(),
		"contextWindowSource": string().readonly(),
		"source": string().readonly()
	})).readonly(),
	"profiles": array(object({
		"id": string().readonly(),
		"name": string().readonly(),
		"engineId": string().readonly(),
		"providerId": string().readonly(),
		"modelRecordId": string().readonly(),
		"reasoningEffort": union([_undefined(), string()]).readonly().optional(),
		"skillSetRef": union([_undefined(), string()]).readonly().optional(),
		"mcpSetRef": union([_undefined(), string()]).readonly().optional(),
		"allowedChildProfiles": array(string()).readonly(),
		"maxChildDepth": number().readonly(),
		"maxConcurrentChildren": number().readonly(),
		"enabled": boolean().readonly()
	})).readonly(),
	"skillSets": array(object({
		"id": string().readonly(),
		"pluginDirs": array(string()).readonly(),
		"additionalDirectories": array(string()).readonly()
	})).readonly(),
	"mcpSets": array(object({
		"id": string().readonly(),
		"servers": array(object({
			"id": string().readonly(),
			"name": string().readonly(),
			"transport": string().readonly()
		})).readonly()
	})).readonly()
});
const _wolffycode_dsh_engine_suite_engineSuiteGateway_createAgent_parameter_0$schema = object({
	"sessionId": string().readonly(),
	"selection": object({
		"engineId": string().readonly(),
		"providerId": string().readonly(),
		"modelRecordId": string().readonly(),
		"reasoningEffort": union([_undefined(), string()]).readonly().optional()
	}).readonly(),
	"cwd": string().readonly()
});
const _wolffycode_dsh_engine_suite_engineSuiteGateway_createAgent_result$schema = object({
	"sessionId": string().readonly(),
	"agentId": string().readonly(),
	"profileId": string().readonly()
});
const _wolffycode_dsh_engine_suite_engineSuiteGateway_discoverModels_parameter_0$schema = string();
const _wolffycode_dsh_engine_suite_engineSuiteGateway_discoverModels_result$schema = object({ "models": array(object({
	"id": string().readonly(),
	"engineId": string().readonly(),
	"providerId": string().readonly(),
	"modelId": string().readonly(),
	"displayName": union([_undefined(), string()]).readonly().optional(),
	"description": union([_undefined(), string()]).readonly().optional(),
	"enabled": boolean().readonly(),
	"hidden": boolean().readonly(),
	"reasoningOptions": array(object({
		"id": string().readonly(),
		"description": union([_undefined(), string()]).readonly().optional()
	})).readonly(),
	"defaultReasoningEffort": union([_undefined(), string()]).readonly().optional(),
	"inputModalities": array(string()).readonly(),
	"contextWindowTokens": union([_undefined(), number()]).readonly().optional(),
	"contextWindowSource": string().readonly(),
	"source": string().readonly()
})).readonly() });
const _wolffycode_dsh_engine_suite_engineSuiteGateway_sessionCommands_parameter_0$schema = string();
const _wolffycode_dsh_engine_suite_engineSuiteGateway_sessionCommands_parameter_1$schema = boolean();
const _wolffycode_dsh_engine_suite_engineSuiteGateway_sessionCommands_result$schema = object({
	"sessionId": string().readonly(),
	"commands": array(object({
		"name": string().readonly(),
		"description": string().readonly(),
		"argumentHint": string().readonly(),
		"source": union([literal("command"), literal("skill")]).readonly()
	})).readonly()
});
const _wolffycode_dsh_engine_suite_engineSuiteGateway_switchAgent_parameter_0$schema = object({
	"sessionId": string().readonly(),
	"selection": object({
		"engineId": string().readonly(),
		"providerId": string().readonly(),
		"modelRecordId": string().readonly(),
		"reasoningEffort": union([_undefined(), string()]).readonly().optional()
	}).readonly()
});
const _wolffycode_dsh_engine_suite_engineSuiteGateway_switchAgent_result$schema = object({
	"sessionId": string().readonly(),
	"agentId": string().readonly(),
	"profileId": string().readonly()
});
const TYPERT_REMOTE = {
	package: "@wolffycode/dsh-engine-suite",
	descriptors: [
		{
			id: "@wolffycode/dsh-engine-suite#engineSuiteGateway/cancelAgent",
			service: "engineSuiteGateway",
			namespace: "engineSuiteGateway",
			method: "cancelAgent",
			invocation: { kind: "direct" },
			parameters: [{
				name: "agentId",
				wire: "agentId",
				source: "json",
				codec: {
					mode: "strict",
					typeSymbol: "@wolffycode/dsh-engine-suite#engineSuiteGateway/cancelAgent:agentId",
					schema: _wolffycode_dsh_engine_suite_engineSuiteGateway_cancelAgent_parameter_0$schema
				}
			}],
			result: {
				mode: "strict",
				typeSymbol: "@wolffycode/dsh-engine-suite#engineSuiteGateway/cancelAgent:result",
				schema: _wolffycode_dsh_engine_suite_engineSuiteGateway_cancelAgent_result$schema
			},
			sourceLocation: {
				"file": "packages/engine-suite/src/remote.ts",
				"line": 280,
				"column": 9
			}
		},
		{
			id: "@wolffycode/dsh-engine-suite#engineSuiteGateway/catalog",
			service: "engineSuiteGateway",
			namespace: "engineSuiteGateway",
			method: "catalog",
			invocation: { kind: "direct" },
			parameters: [],
			result: {
				mode: "strict",
				typeSymbol: "@wolffycode/dsh-engine-suite/types#EngineSuiteCatalogView",
				schema: _wolffycode_dsh_engine_suite_engineSuiteGateway_catalog_result$schema
			},
			sourceLocation: {
				"file": "packages/engine-suite/src/remote.ts",
				"line": 48,
				"column": 9
			}
		},
		{
			id: "@wolffycode/dsh-engine-suite#engineSuiteGateway/createAgent",
			service: "engineSuiteGateway",
			namespace: "engineSuiteGateway",
			method: "createAgent",
			invocation: { kind: "direct" },
			parameters: [{
				name: "request",
				wire: "request",
				source: "json",
				codec: {
					mode: "strict",
					typeSymbol: "@wolffycode/dsh-engine-suite/types#EngineSuiteCreateAgentRequest",
					schema: _wolffycode_dsh_engine_suite_engineSuiteGateway_createAgent_parameter_0$schema
				}
			}],
			result: {
				mode: "strict",
				typeSymbol: "@wolffycode/dsh-engine-suite/types#EngineSuiteCreateAgentResponse",
				schema: _wolffycode_dsh_engine_suite_engineSuiteGateway_createAgent_result$schema
			},
			sourceLocation: {
				"file": "packages/engine-suite/src/remote.ts",
				"line": 185,
				"column": 9
			}
		},
		{
			id: "@wolffycode/dsh-engine-suite#engineSuiteGateway/discoverModels",
			service: "engineSuiteGateway",
			namespace: "engineSuiteGateway",
			method: "discoverModels",
			invocation: { kind: "direct" },
			parameters: [{
				name: "providerId",
				wire: "providerId",
				source: "json",
				codec: {
					mode: "strict",
					typeSymbol: "@wolffycode/dsh-engine-suite#engineSuiteGateway/discoverModels:providerId",
					schema: _wolffycode_dsh_engine_suite_engineSuiteGateway_discoverModels_parameter_0$schema
				}
			}],
			result: {
				mode: "strict",
				typeSymbol: "@wolffycode/dsh-engine-suite/types#EngineSuiteDiscoverModelsResponse",
				schema: _wolffycode_dsh_engine_suite_engineSuiteGateway_discoverModels_result$schema
			},
			sourceLocation: {
				"file": "packages/engine-suite/src/remote.ts",
				"line": 243,
				"column": 9
			}
		},
		{
			id: "@wolffycode/dsh-engine-suite#engineSuiteGateway/sessionCommands",
			service: "engineSuiteGateway",
			namespace: "engineSuiteGateway",
			method: "sessionCommands",
			invocation: { kind: "direct" },
			parameters: [{
				name: "sessionId",
				wire: "sessionId",
				source: "json",
				codec: {
					mode: "strict",
					typeSymbol: "@wolffycode/dsh-engine-suite#engineSuiteGateway/sessionCommands:sessionId",
					schema: _wolffycode_dsh_engine_suite_engineSuiteGateway_sessionCommands_parameter_0$schema
				}
			}, {
				name: "refresh",
				wire: "refresh",
				source: "json",
				codec: {
					mode: "strict",
					typeSymbol: "@wolffycode/dsh-engine-suite#engineSuiteGateway/sessionCommands:refresh",
					schema: _wolffycode_dsh_engine_suite_engineSuiteGateway_sessionCommands_parameter_1$schema
				}
			}],
			result: {
				mode: "strict",
				typeSymbol: "@wolffycode/dsh-engine-suite/types#EngineSuiteCommandsResponse",
				schema: _wolffycode_dsh_engine_suite_engineSuiteGateway_sessionCommands_result$schema
			},
			sourceLocation: {
				"file": "packages/engine-suite/src/remote.ts",
				"line": 232,
				"column": 9
			}
		},
		{
			id: "@wolffycode/dsh-engine-suite#engineSuiteGateway/switchAgent",
			service: "engineSuiteGateway",
			namespace: "engineSuiteGateway",
			method: "switchAgent",
			invocation: { kind: "direct" },
			parameters: [{
				name: "request",
				wire: "request",
				source: "json",
				codec: {
					mode: "strict",
					typeSymbol: "@wolffycode/dsh-engine-suite/types#EngineSuiteSwitchAgentRequest",
					schema: _wolffycode_dsh_engine_suite_engineSuiteGateway_switchAgent_parameter_0$schema
				}
			}],
			result: {
				mode: "strict",
				typeSymbol: "@wolffycode/dsh-engine-suite/types#EngineSuiteSwitchAgentResponse",
				schema: _wolffycode_dsh_engine_suite_engineSuiteGateway_switchAgent_result$schema
			},
			sourceLocation: {
				"file": "packages/engine-suite/src/remote.ts",
				"line": 211,
				"column": 9
			}
		}
	]
};
//#endregion
//#region src/client/settings.ts
/** Client-safe name of the Host-persisted Engine Suite settings namespace. */
const ENGINE_SUITE_SETTINGS_NAMESPACE = "engine-suite";
//#endregion
//#region src/client/agent-preset.ts
function createEngineSuiteAgentPresetFace(connection) {
	return {
		async list() {
			const response = await connection.api.agentPresets.list({});
			if (!response.result.ok) throw new Error(response.result.error.message);
			return response.result.value.presets.filter((preset) => preset.broken === void 0);
		},
		async select(sessionId, agentPreset) {
			const response = await connection.api.agentPresets.select({
				sessionId,
				agentPreset
			});
			if (!response.result.ok) throw new Error(response.result.error.message);
			return response.result.value.agentPreset;
		}
	};
}
function presetDisplayName(preset) {
	if (preset.name !== void 0 && preset.name.trim() !== "") return preset.name;
	if (preset.id === "standard") return "标准模式";
	if (preset.id === "code") return "PTC 模式";
	if (preset.id === "minimal") return "极简模式";
	if (preset.id === "cordis") return "创造模式";
	return preset.id;
}
//#endregion
//#region src/client/composer-runtime.ts
let runtime;
const selections = /* @__PURE__ */ new Map();
function setEngineSuiteComposerRuntime(next) {
	runtime = next;
	if (next === void 0) selections.clear();
}
function getEngineSuiteComposerRuntime() {
	return runtime;
}
function setEngineSuiteSessionSelection(sessionId, selection) {
	selections.set(sessionId, selection);
}
function getEngineSuiteSessionSelection(sessionId) {
	return selections.get(sessionId);
}
//#endregion
//#region src/client/composer-selection.ts
function engineSelectionLocked(locked, sessionBlank) {
	return locked || sessionBlank !== true;
}
function normalizedQuery(query) {
	return query.trim().toLocaleLowerCase();
}
function includesQuery(values, query) {
	const normalized = normalizedQuery(query);
	return normalized === "" || values.some((value) => value.toLocaleLowerCase().includes(normalized));
}
function filterEngineOptions(engines, query) {
	return engines.filter((engine) => includesQuery([
		engine.displayName,
		engine.id,
		engine.type
	], query));
}
function filterProviderOptions(providers, query) {
	return providers.filter((provider) => includesQuery([
		provider.name,
		provider.id,
		provider.baseUri
	], query));
}
function filterModelOptions(models, query) {
	return models.filter((model) => includesQuery([
		model.displayName ?? "",
		model.modelId,
		model.id,
		model.description ?? ""
	], query));
}
function enabledProviders(catalog, engineId) {
	return catalog.providers.filter((provider) => provider.engineId === engineId && provider.enabled);
}
function enabledModels(catalog, providerId) {
	return catalog.models.filter((model) => model.providerId === providerId && model.enabled && !model.hidden);
}
function defaultReasoningEffort(model) {
	return model?.defaultReasoningEffort ?? model?.reasoningOptions[0]?.id ?? "";
}
function resolveEngineSelection(catalog, engineId) {
	const provider = enabledProviders(catalog, engineId)[0];
	const model = enabledModels(catalog, provider?.id ?? "")[0];
	return {
		engineId,
		providerId: provider?.id ?? "",
		modelRecordId: model?.id ?? "",
		reasoningEffort: defaultReasoningEffort(model)
	};
}
function resolveProviderSelection(catalog, engineId, providerId) {
	const model = enabledModels(catalog, providerId)[0];
	return {
		engineId,
		providerId,
		modelRecordId: model?.id ?? "",
		reasoningEffort: defaultReasoningEffort(model)
	};
}
function resolveModelSelection(models, modelRecordId) {
	return {
		modelRecordId,
		reasoningEffort: defaultReasoningEffort(models.find((candidate) => candidate.id === modelRecordId))
	};
}
//#endregion
//#region src/client/EngineSuiteComposerSelector.tsx
const EMPTY_SNAPSHOT = {
	status: "idle",
	catalog: null,
	error: null
};
const EMPTY_SUBSCRIBE = () => () => void 0;
const EMPTY_SNAPSHOT_GETTER = () => EMPTY_SNAPSHOT;
function displayModel(model) {
	return model.displayName ?? model.modelId;
}
function contextLabel(model) {
	const tokens = model.contextWindowTokens;
	if (tokens === void 0) return void 0;
	if (tokens >= 1e6) return "1M 上下文";
	if (tokens >= 1e3) return `${Math.round(tokens / 1e3)}K 上下文`;
	return `${tokens} tokens`;
}
function engineMeta(engine) {
	if (engine.type === "deepseek-native") return "DeepSeek 内置";
	if (engine.type === "claude-cli") return "本地 Claude CLI";
	if (engine.type === "codex-cli") return "本地 Codex CLI";
	return "Harness 引擎";
}
function providerMeta(provider) {
	return provider.baseUri === "" ? "DeepSeek 内置服务" : provider.baseUri.replace(/^https?:\/\//u, "");
}
function Icon({ name, size = 16 }) {
	const common = {
		width: size,
		height: size,
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: 1.8,
		strokeLinecap: "round",
		strokeLinejoin: "round",
		"aria-hidden": true
	};
	if (name === "spark") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
		...common,
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m12 3 1.65 5.35L19 10l-5.35 1.65L12 17l-1.65-5.35L5 10l5.35-1.65L12 3Z" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z" })]
	});
	if (name === "chevron") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
		...common,
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m6 9 6 6 6-6" })
	});
	if (name === "check") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
		...common,
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m5 12 4.2 4.2L19 6.5" })
	});
	if (name === "engine") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
		...common,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M4 6.5h16M4 12h16M4 17.5h16" }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
				cx: "8",
				cy: "6.5",
				r: "1.5"
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
				cx: "15",
				cy: "12",
				r: "1.5"
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
				cx: "10",
				cy: "17.5",
				r: "1.5"
			})
		]
	});
	if (name === "provider") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
		...common,
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
			cx: "12",
			cy: "12",
			r: "8.5"
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M3.5 12h17M12 3.5c2.1 2.3 3.2 5.1 3.2 8.5s-1.1 6.2-3.2 8.5c-2.1-2.3-3.2-6.2-3.2-8.5S9.9 5.8 12 3.5Z" })]
	});
	if (name === "model") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
		...common,
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M6.5 4.5h11A2.5 2.5 0 0 1 20 7v10a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17V7a2.5 2.5 0 0 1 2.5-2.5Z" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M8 9h8M8 13h5" })]
	});
	if (name === "reasoning") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
		...common,
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M9.5 18.5h5M10 21h4M8.7 15.5A6.5 6.5 0 1 1 15.3 15c-.8.6-1.1 1.2-1.2 2h-4.2c-.1-.7-.4-1.2-1.2-1.5Z" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 2v1.5M4.9 4.9 6 6M19.1 4.9 18 6" })]
	});
	if (name === "search") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
		...common,
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
			cx: "10.8",
			cy: "10.8",
			r: "6.2"
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m16 16 4.2 4.2" })]
	});
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
		...common,
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m6 6 12 12M18 6 6 18" })
	});
}
function optionStyle(selected) {
	return {
		alignItems: "center",
		background: selected ? "color-mix(in srgb, var(--engine-suite-accent) 8%, transparent)" : "transparent",
		border: selected ? "1px solid color-mix(in srgb, var(--engine-suite-accent) 38%, transparent)" : "1px solid transparent",
		borderRadius: 9,
		color: "inherit",
		cursor: "pointer",
		display: "flex",
		gap: 8,
		minHeight: 42,
		padding: "7px 8px",
		textAlign: "left",
		width: "100%"
	};
}
function EngineSuiteComposerSelector({ locked, useSession, sessionId, useSessions, agentPreset }) {
	const runtime = getEngineSuiteComposerRuntime();
	const catalog = runtime?.catalog;
	const snapshot = (0, react.useSyncExternalStore)(catalog?.subscribe ?? EMPTY_SUBSCRIBE, catalog?.getSnapshot ?? EMPTY_SNAPSHOT_GETTER, catalog?.getSnapshot ?? EMPTY_SNAPSHOT_GETTER);
	const rootRef = (0, react.useRef)(null);
	const sessionSummary = useSessions((state) => state.byId[sessionId]);
	const engineLocked = engineSelectionLocked(locked, sessionSummary?.blank);
	const [presetOptions, setPresetOptions] = (0, react.useState)([]);
	const [presetId, setPresetId] = (0, react.useState)("");
	const [presetOpen, setPresetOpen] = (0, react.useState)(false);
	const triggerRef = (0, react.useRef)(null);
	const persistedSelection = getEngineSuiteSessionSelection(sessionId);
	const [engineId, setEngineId] = (0, react.useState)(persistedSelection?.engineId ?? "");
	const [providerId, setProviderId] = (0, react.useState)(persistedSelection?.providerId ?? "");
	const [modelRecordId, setModelRecordId] = (0, react.useState)(persistedSelection?.modelRecordId ?? "");
	const [reasoningEffort, setReasoningEffort] = (0, react.useState)(persistedSelection?.reasoningEffort ?? "");
	const selectionSessionRef = (0, react.useRef)(sessionId);
	const [open, setOpen] = (0, react.useState)(false);
	const [panelClosing, setPanelClosing] = (0, react.useState)(false);
	const closeTimerRef = (0, react.useRef)(void 0);
	const [anchor, setAnchor] = (0, react.useState)(null);
	const [engineQuery, setEngineQuery] = (0, react.useState)("");
	const [providerQuery, setProviderQuery] = (0, react.useState)("");
	const [modelQuery, setModelQuery] = (0, react.useState)("");
	const [selectionBusy, setSelectionBusy] = (0, react.useState)(false);
	const [selectionError, setSelectionError] = (0, react.useState)();
	const automaticSelectionAttempt = (0, react.useRef)();
	const engines = snapshot.catalog?.engines ?? [];
	const providers = (0, react.useMemo)(() => snapshot.catalog === null ? [] : enabledProviders(snapshot.catalog, engineId), [snapshot.catalog?.providers, engineId]);
	const models = (0, react.useMemo)(() => snapshot.catalog === null ? [] : enabledModels(snapshot.catalog, providerId), [snapshot.catalog?.models, providerId]);
	const filteredEngines = (0, react.useMemo)(() => filterEngineOptions(engines, engineQuery), [engines, engineQuery]);
	const filteredProviders = (0, react.useMemo)(() => filterProviderOptions(providers, providerQuery), [providers, providerQuery]);
	const filteredModels = (0, react.useMemo)(() => filterModelOptions(models, modelQuery), [models, modelQuery]);
	const selectedEngine = engines.find((engine) => engine.id === engineId);
	const selectedProvider = providers.find((provider) => provider.id === providerId);
	const selectedModel = models.find((model) => model.id === modelRecordId);
	const reasoningOptions = selectedModel?.reasoningOptions ?? [];
	const engineLabel = selectedEngine?.displayName ?? "选择引擎";
	const providerLabel = selectedProvider?.name ?? "未选择服务商";
	const modelLabel = selectedModel === void 0 ? "未选择模型" : displayModel(selectedModel);
	const effortLabel = reasoningEffort === "" ? "默认" : reasoningEffort;
	const showPreset = selectedEngine?.type === "deepseek-native" && sessionSummary?.blank === true && agentPreset !== void 0;
	(0, react.useEffect)(() => {
		if (selectionSessionRef.current === sessionId) return;
		selectionSessionRef.current = sessionId;
		const next = getEngineSuiteSessionSelection(sessionId);
		setEngineId(next?.engineId ?? "");
		setProviderId(next?.providerId ?? "");
		setModelRecordId(next?.modelRecordId ?? "");
		setReasoningEffort(next?.reasoningEffort ?? "");
		setEngineQuery("");
		setProviderQuery("");
		setModelQuery("");
		setSelectionError(void 0);
	}, [sessionId]);
	(0, react.useEffect)(() => {
		if (selectedEngine?.type === "deepseek-native") return;
		if (providerId === "" || modelRecordId === "") return;
		runtime?.setSessionSelection(sessionId, {
			engineId,
			providerId,
			modelRecordId,
			...reasoningEffort === "" ? {} : { reasoningEffort }
		});
	}, [
		engineId,
		modelRecordId,
		providerId,
		reasoningEffort,
		runtime,
		selectedEngine?.type,
		sessionId
	]);
	(0, react.useEffect)(() => {
		if (!showPreset || agentPreset === void 0) {
			setPresetOptions([]);
			setPresetOpen(false);
			return;
		}
		let cancelled = false;
		agentPreset.list().then((options) => {
			if (cancelled) return;
			setPresetOptions(options);
			const current = sessionSummary?.agentPreset ?? options.find((option) => option.isDefault)?.id ?? options[0]?.id ?? "";
			setPresetId(current);
		}).catch(() => {
			if (!cancelled) setPresetOptions([]);
		});
		return () => {
			cancelled = true;
		};
	}, [
		agentPreset,
		sessionSummary?.agentPreset,
		showPreset
	]);
	(0, react.useEffect)(() => {
		if (engineId !== "" && engines.some((candidate) => candidate.id === engineId)) return;
		const next = engines.find((candidate) => snapshot.catalog !== null && enabledProviders(snapshot.catalog, candidate.id).length > 0) ?? engines[0];
		if (next !== void 0 && next.id !== engineId) setEngineId(next.id);
	}, [
		engines,
		engineId,
		snapshot.catalog
	]);
	(0, react.useEffect)(() => {
		if (providers.some((provider) => provider.id === providerId)) return;
		const nextProvider = providers[0];
		setProviderId(nextProvider?.id ?? "");
	}, [providers, providerId]);
	(0, react.useEffect)(() => {
		if (models.some((model) => model.id === modelRecordId)) return;
		const nextModel = models[0];
		setModelRecordId(nextModel?.id ?? "");
		setReasoningEffort(defaultReasoningEffort(nextModel));
	}, [models, modelRecordId]);
	(0, react.useEffect)(() => {
		if (selectedModel === void 0) {
			setReasoningEffort("");
			return;
		}
		if (reasoningEffort !== "" && reasoningOptions.some((option) => option.id === reasoningEffort)) return;
		setReasoningEffort(defaultReasoningEffort(selectedModel));
	}, [
		selectedModel,
		reasoningEffort,
		reasoningOptions
	]);
	const updateAnchor = (0, react.useCallback)(() => {
		const rect = triggerRef.current?.getBoundingClientRect();
		if (rect === void 0) return;
		setAnchor({
			left: rect.left,
			right: rect.right,
			top: rect.top
		});
	}, []);
	(0, react.useLayoutEffect)(() => {
		if (!open) return;
		updateAnchor();
		const onViewportChange = () => updateAnchor();
		window.addEventListener("resize", onViewportChange);
		window.addEventListener("scroll", onViewportChange, true);
		return () => {
			window.removeEventListener("resize", onViewportChange);
			window.removeEventListener("scroll", onViewportChange, true);
		};
	}, [open, updateAnchor]);
	const closePanel = (0, react.useCallback)(() => {
		if (!open || panelClosing) return;
		setPanelClosing(true);
		if (closeTimerRef.current !== void 0) window.clearTimeout(closeTimerRef.current);
		closeTimerRef.current = window.setTimeout(() => {
			setOpen(false);
			setPanelClosing(false);
			closeTimerRef.current = void 0;
		}, 150);
	}, [open, panelClosing]);
	(0, react.useEffect)(() => () => {
		if (closeTimerRef.current !== void 0) window.clearTimeout(closeTimerRef.current);
	}, []);
	(0, react.useEffect)(() => {
		if (!open) return;
		const onPointerDown = (event) => {
			const target = event.target;
			if (target instanceof Node && !rootRef.current?.contains(target)) {
				closePanel();
				setPresetOpen(false);
			}
		};
		const onKeyDown = (event) => {
			if (event.key === "Escape") {
				if (presetOpen) {
					setPresetOpen(false);
					return;
				}
				closePanel();
				triggerRef.current?.focus();
			}
		};
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [
		open,
		closePanel,
		presetOpen
	]);
	const applySelection = (selection) => {
		const engine = engines.find((candidate) => candidate.id === selection.engineId);
		if (engine === void 0) return;
		if (engine.type === "deepseek-native") {
			runtime?.setSessionSelection(sessionId, selection);
			return;
		}
		if (runtime === void 0) return;
		if (locked || engineLocked && selection.engineId !== engineId || selection.providerId === "" || selection.modelRecordId === "") return;
		setSelectionBusy(true);
		setSelectionError(void 0);
		const request = {
			sessionId,
			selection,
			cwd: sessionSummary?.cwd ?? ""
		};
		runtime.createAgent(request).then(() => {
			runtime.setSessionSelection(sessionId, selection);
			setSelectionBusy(false);
		}, (error) => {
			setSelectionBusy(false);
			setSelectionError(error instanceof Error ? error.message : String(error));
		});
	};
	(0, react.useEffect)(() => {
		if (sessionSummary?.blank !== true || runtime === void 0 || snapshot.catalog === null || engineId === "" || providerId === "" || modelRecordId === "") return;
		if (getEngineSuiteSessionSelection(sessionId) !== void 0 || selectionBusy) return;
		const selection = {
			engineId,
			providerId,
			modelRecordId,
			...reasoningEffort === "" ? {} : { reasoningEffort }
		};
		const attemptKey = [
			sessionId,
			selection.engineId,
			selection.providerId,
			selection.modelRecordId,
			selection.reasoningEffort ?? ""
		].join("\0");
		if (automaticSelectionAttempt.current === attemptKey) return;
		automaticSelectionAttempt.current = attemptKey;
		applySelection(selection);
	}, [
		engineId,
		modelRecordId,
		providerId,
		reasoningEffort,
		runtime,
		selectionBusy,
		sessionId,
		sessionSummary?.blank,
		snapshot.catalog
	]);
	const currentSelection = (overrides = {}) => ({
		engineId,
		providerId,
		modelRecordId,
		...reasoningEffort === "" ? {} : { reasoningEffort },
		...overrides
	});
	const chooseEngine = (nextEngineId) => {
		if (snapshot.catalog === null || engineLocked) return;
		const next = resolveEngineSelection(snapshot.catalog, nextEngineId);
		setEngineId(next.engineId);
		setProviderId(next.providerId);
		setModelRecordId(next.modelRecordId);
		setReasoningEffort(next.reasoningEffort);
		setProviderQuery("");
		setModelQuery("");
		applySelection({
			engineId: next.engineId,
			providerId: next.providerId,
			modelRecordId: next.modelRecordId,
			...next.reasoningEffort === "" ? {} : { reasoningEffort: next.reasoningEffort }
		});
	};
	const chooseProvider = (nextProviderId) => {
		if (snapshot.catalog === null) return;
		const next = resolveProviderSelection(snapshot.catalog, engineId, nextProviderId);
		setProviderId(next.providerId);
		setModelRecordId(next.modelRecordId);
		setReasoningEffort(next.reasoningEffort);
		setModelQuery("");
		applySelection({
			engineId,
			providerId: next.providerId,
			modelRecordId: next.modelRecordId,
			...next.reasoningEffort === "" ? {} : { reasoningEffort: next.reasoningEffort }
		});
	};
	const chooseModel = (nextModelId) => {
		const next = resolveModelSelection(models, nextModelId);
		setModelRecordId(next.modelRecordId);
		setReasoningEffort(next.reasoningEffort);
		applySelection({
			engineId,
			providerId,
			modelRecordId: next.modelRecordId,
			...next.reasoningEffort === "" ? {} : { reasoningEffort: next.reasoningEffort }
		});
		if (models.find((model) => model.id === nextModelId)?.reasoningOptions.length === 0) closePanel();
	};
	const selectPreset = (nextPresetId) => {
		if (!showPreset || sessionSummary?.blank !== true) return;
		setPresetId(nextPresetId);
		setPresetOpen(false);
	};
	const toggleOpen = () => {
		if (locked) return;
		if (open) {
			closePanel();
			return;
		}
		if (closeTimerRef.current !== void 0) window.clearTimeout(closeTimerRef.current);
		setPanelClosing(false);
		updateAnchor();
		setEngineQuery("");
		setProviderQuery("");
		setModelQuery("");
		setOpen(true);
	};
	if (runtime === void 0) return null;
	if (snapshot.catalog === null && snapshot.status === "error") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
		role: "status",
		"data-engine-suite-selector": "true",
		className: "engine-suite-selector engine-suite-selector--inline-error",
		children: ["Engine Suite unavailable: ", snapshot.error]
	});
	if (snapshot.catalog === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
		role: "status",
		"data-engine-suite-selector": "true",
		className: "engine-suite-selector engine-suite-selector--loading",
		children: "正在加载引擎…"
	});
	const panelStyle = anchor === null ? { visibility: "hidden" } : {
		left: Math.max(12, Math.min(anchor.right - 690, window.innerWidth - 702)),
		bottom: Math.max(12, window.innerHeight - anchor.top + 8)
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		ref: rootRef,
		className: "engine-suite-selector",
		"data-engine-suite-selector": "true",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: `
        .engine-suite-selector, .engine-suite-selector * { box-sizing: border-box; }
        .engine-suite-selector { --engine-suite-accent: var(--dsw-alias-brand-primary-new-colorprimary-new-color, var(--dsw-static-deepseek-500, currentColor)); position: relative; display: inline-flex; align-items: center; gap: 2px; color: inherit; font-family: inherit; }
        .engine-suite-preset { position: relative; display: inline-flex; align-items: center; }
        .engine-suite-preset__trigger { display: inline-flex; align-items: center; gap: 5px; min-height: 28px; padding: 0 4px 0 8px; border: 0; border-radius: 24px; color: var(--dsw-alias-label-secondary, color-mix(in srgb, currentColor 62%, transparent)); background: transparent; cursor: pointer; font: inherit; font-size: 13px; font-weight: 450; line-height: 28px; }
        .engine-suite-preset__trigger:hover { background: var(--dsw-alias-interactive-bg-hover, color-mix(in srgb, currentColor 6%, transparent)); }
        .engine-suite-preset__icon { display: inline-flex; color: var(--dsw-alias-label-tertiary, color-mix(in srgb, currentColor 58%, transparent)); }
        .engine-suite-preset__value { max-width: 104px; overflow: hidden; font-size: 13px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
        .engine-suite-preset__menu { position: absolute; z-index: 2147483001; right: 0; bottom: calc(100% + 7px); display: grid; min-width: 155px; padding: 5px; border: 1px solid var(--dsw-alias-border-l2, color-mix(in srgb, currentColor 14%, transparent)); border-radius: 9px; background: var(--dsw-specific-menu, var(--dsw-alias-bg-layer-3, Canvas)); box-shadow: 0 12px 30px color-mix(in srgb, black 18%, transparent); }
        .engine-suite-preset__option { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 32px; padding: 6px 8px; border: 0; border-radius: 7px; color: inherit; background: transparent; cursor: pointer; font: inherit; font-size: 12px; text-align: left; }
        .engine-suite-preset__option:hover { background: var(--dsw-alias-interactive-bg-hover, color-mix(in srgb, currentColor 6%, transparent)); }
        .engine-suite-preset__option[aria-selected="true"] { color: var(--engine-suite-accent); background: color-mix(in srgb, var(--engine-suite-accent) 8%, transparent); }
        .engine-suite-preset__error { position: absolute; right: 0; bottom: calc(100% + 7px); max-width: 220px; padding: 7px 8px; border-radius: 7px; color: var(--dsw-alias-state-error-primary, #c23b55); background: var(--dsw-alias-bg-layer-3, Canvas); box-shadow: 0 8px 20px color-mix(in srgb, black 16%, transparent); font-size: 10px; }
        .engine-suite-trigger { display: inline-flex; align-items: center; gap: 5px; min-width: 196px; max-width: min(320px, 100%); min-height: 28px; padding: 0 4px 0 8px; border: 0; border-radius: 24px; color: var(--dsw-alias-label-secondary, color-mix(in srgb, currentColor 62%, transparent)); background: transparent; box-shadow: none; cursor: pointer; text-align: left; transition: background 140ms ease, color 140ms ease, transform 140ms ease; font: inherit; font-size: 13px; font-weight: 450; line-height: 28px; }
        .engine-suite-trigger:hover { background: var(--dsw-alias-interactive-bg-hover, color-mix(in srgb, currentColor 6%, transparent)); }
        .engine-suite-trigger:active { transform: translateY(1px); }
        .engine-suite-trigger:focus-visible, .engine-suite-option:focus-visible, .engine-suite-search:focus-visible { outline: 2px solid color-mix(in srgb, var(--engine-suite-accent) 72%, currentColor 28%); outline-offset: 2px; }
        .engine-suite-trigger__icon { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; flex: 0 0 16px; color: var(--dsw-alias-label-tertiary, color-mix(in srgb, currentColor 58%, transparent)); }
        .engine-suite-trigger__copy { display: block; min-width: 0; flex: 1; line-height: 28px; }
        .engine-suite-trigger__value { display: block; overflow: hidden; font-size: 13px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
        .engine-suite-trigger__separator { color: var(--dsw-alias-label-tertiary, color-mix(in srgb, currentColor 48%, transparent)); font-weight: 450; }
        .engine-suite-trigger__effort { color: var(--engine-suite-accent); font-size: 12px; font-weight: 550; }
        .engine-suite-selection-error { max-width: 220px; overflow: hidden; color: var(--dsw-alias-state-error-primary, #c23b55); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
        .engine-suite-trigger__chevron { display: inline-flex; color: var(--dsw-alias-label-tertiary, color-mix(in srgb, currentColor 52%, transparent)); transition: transform 150ms cubic-bezier(.2,.8,.2,1); }
        .engine-suite-trigger[aria-expanded="true"] .engine-suite-trigger__chevron { transform: rotate(180deg); }
        .engine-suite-popover { position: fixed; z-index: 2147483000; width: min(690px, calc(100vw - 24px)); height: 352px; overflow: hidden; border: 1px solid var(--dsw-alias-border-l2, color-mix(in srgb, currentColor 14%, transparent)); border-radius: 13px; color: var(--dsw-alias-label-primary, inherit); background: var(--dsw-specific-menu, var(--dsw-alias-bg-layer-3, Canvas)); box-shadow: 0 18px 55px color-mix(in srgb, black 22%, transparent), 0 2px 8px color-mix(in srgb, currentColor 10%, transparent), inset 0 1px 0 color-mix(in srgb, white 55%, transparent); backdrop-filter: blur(18px); animation: engine-suite-popover-in 150ms cubic-bezier(.2,.8,.2,1) both; }
        .engine-suite-popover[data-state="closing"] { animation: engine-suite-popover-out 150ms cubic-bezier(.4,0,1,1) both; pointer-events: none; }
        .engine-suite-columns { display: grid; grid-template-columns: minmax(140px, .95fr) minmax(150px, 1fr) minmax(165px, 1.05fr) minmax(120px, .75fr); height: 100%; min-width: 620px; overflow: hidden; }
        .engine-suite-column { display: flex; min-width: 0; min-height: 0; flex-direction: column; padding: 12px 10px; overflow: hidden; }
        .engine-suite-column + .engine-suite-column { border-left: 1px solid var(--dsw-alias-border-l1, color-mix(in srgb, currentColor 9%, transparent)); }
        .engine-suite-column__header { display: flex; align-items: center; gap: 7px; flex: 0 0 auto; margin: 0 2px 8px; color: var(--dsw-alias-label-secondary, color-mix(in srgb, currentColor 60%, transparent)); font-size: 10.5px; font-weight: 650; letter-spacing: .02em; }
        .engine-suite-column__header-icon { display: inline-flex; color: var(--dsw-alias-label-tertiary, color-mix(in srgb, currentColor 58%, transparent)); }
        .engine-suite-search { display: flex; align-items: center; gap: 6px; width: 100%; min-height: 29px; flex: 0 0 29px; margin-bottom: 7px; padding: 4px 7px; border: 1px solid transparent; border-radius: 7px; outline: 0; color: inherit; background: var(--dsw-alias-bg-module-platform, color-mix(in srgb, currentColor 4%, transparent)); box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l1, color-mix(in srgb, currentColor 10%, transparent)); font: inherit; font-size: 10.5px; transition: background 140ms ease, box-shadow 140ms ease; }
        .engine-suite-search:focus-within { background: var(--dsw-alias-bg-layer-1, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--engine-suite-accent) 52%, transparent), 0 0 0 2px color-mix(in srgb, var(--engine-suite-accent) 10%, transparent); }
        .engine-suite-search__icon { display: inline-flex; flex: 0 0 auto; color: var(--dsw-alias-label-tertiary, color-mix(in srgb, currentColor 48%, transparent)); opacity: .88; }
        .engine-suite-search__input { min-width: 0; flex: 1; border: 0; outline: 0; color: inherit; background: transparent; font: inherit; font-size: 10.5px; }
        .engine-suite-list, .engine-suite-effort-list { display: grid; align-content: start; gap: 2px; min-height: 0; flex: 1 1 auto; overflow-y: auto; overflow-x: hidden; scrollbar-width: thin; scrollbar-color: color-mix(in srgb, currentColor 26%, transparent) transparent; }
        .engine-suite-list::-webkit-scrollbar, .engine-suite-effort-list::-webkit-scrollbar { width: 3px; height: 3px; }
        .engine-suite-list::-webkit-scrollbar-track, .engine-suite-effort-list::-webkit-scrollbar-track { background: transparent; }
        .engine-suite-list::-webkit-scrollbar-thumb, .engine-suite-effort-list::-webkit-scrollbar-thumb { border-radius: 3px; background: color-mix(in srgb, currentColor 26%, transparent); }
        .engine-suite-option:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, color-mix(in srgb, currentColor 6%, transparent)) !important; border-color: transparent !important; }
        .engine-suite-option:disabled { cursor: not-allowed; }
        .engine-suite-column--engine-locked .engine-suite-option:disabled { color: var(--dsw-alias-label-tertiary, color-mix(in srgb, currentColor 48%, transparent)) !important; background: var(--dsw-alias-bg-module-platform, color-mix(in srgb, currentColor 4%, transparent)) !important; border-color: transparent !important; box-shadow: none; opacity: .82; }
        .engine-suite-column--engine-locked .engine-suite-option[aria-selected="true"] { box-shadow: inset 2px 0 0 var(--dsw-alias-border-l3, color-mix(in srgb, currentColor 22%, transparent)); }
        .engine-suite-column--engine-locked .engine-suite-option__title { color: var(--dsw-alias-label-secondary, color-mix(in srgb, currentColor 58%, transparent)); }
        .engine-suite-column--engine-locked .engine-suite-option__meta { color: var(--dsw-alias-label-tertiary, color-mix(in srgb, currentColor 42%, transparent)); }
        .engine-suite-column--engine-locked .engine-suite-option__mark { border-color: var(--dsw-alias-border-l3, color-mix(in srgb, currentColor 22%, transparent)); color: transparent; background: transparent; }
        .engine-suite-column--engine-locked .engine-suite-option[aria-selected="true"] .engine-suite-option__mark { border-color: var(--dsw-alias-border-l3, color-mix(in srgb, currentColor 28%, transparent)); color: var(--dsw-alias-label-tertiary, color-mix(in srgb, currentColor 48%, transparent)); background: color-mix(in srgb, currentColor 4%, transparent); }
        .engine-suite-option[aria-selected="true"] { box-shadow: inset 2px 0 0 var(--engine-suite-accent); }
        .engine-suite-option__mark { display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; flex: 0 0 15px; border: 1px solid var(--dsw-alias-border-l3, color-mix(in srgb, currentColor 20%, transparent)); border-radius: 50%; color: transparent; }
        .engine-suite-option[aria-selected="true"] .engine-suite-option__mark { border-color: var(--engine-suite-accent); color: var(--engine-suite-accent); background: color-mix(in srgb, var(--engine-suite-accent) 12%, transparent); }
        .engine-suite-option__copy { display: grid; min-width: 0; gap: 2px; }
        .engine-suite-option__title { overflow: hidden; font-size: 10.5px; font-weight: 620; text-overflow: ellipsis; white-space: nowrap; }
        .engine-suite-option__meta { overflow: hidden; color: var(--dsw-alias-label-tertiary, color-mix(in srgb, currentColor 48%, transparent)); font-size: 9.5px; text-overflow: ellipsis; white-space: nowrap; }
        .engine-suite-effort { min-height: 32px; justify-content: space-between; }
        .engine-suite-effort__label { font-size: 10.5px; font-weight: 620; }
        .engine-suite-empty { margin: 7px 2px; color: var(--dsw-alias-label-tertiary, color-mix(in srgb, currentColor 50%, transparent)); font-size: 10px; line-height: 1.45; }
        .engine-suite-selector--loading, .engine-suite-selector--inline-error { color: var(--dsw-alias-label-secondary, color-mix(in srgb, currentColor 58%, transparent)); font-size: 11px; }
        @keyframes engine-suite-popover-in { from { opacity: 0; transform: translateY(7px) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes engine-suite-popover-out { from { opacity: 1; transform: translateY(0) scale(1); } to { opacity: 0; transform: translateY(7px) scale(.985); } }
        @media (max-width: 840px) { .engine-suite-popover { width: calc(100vw - 24px); } .engine-suite-popover > .engine-suite-columns { overflow: visible; } .engine-suite-selector { max-width: 100%; } }
        @media (max-width: 560px) { .engine-suite-trigger { min-width: 188px; } .engine-suite-trigger__value { max-width: 240px; } .engine-suite-popover { width: calc(100vw - 24px); } }
        @media (prefers-reduced-motion: reduce) { .engine-suite-trigger, .engine-suite-option, .engine-suite-popover { animation: none; transition: none; } }
      ` }),
			showPreset && presetOptions.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "engine-suite-preset",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "engine-suite-preset__trigger",
					"aria-haspopup": "menu",
					"aria-expanded": presetOpen,
					onClick: () => setPresetOpen((value) => !value),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "engine-suite-preset__icon",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
								name: "spark",
								size: 15
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "engine-suite-preset__value",
							children: presetDisplayName(presetOptions.find((option) => option.id === presetId) ?? presetOptions[0])
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
							name: "chevron",
							size: 12
						})
					]
				}), presetOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "engine-suite-preset__menu",
					role: "menu",
					"aria-label": "Agent 模式",
					children: presetOptions.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						role: "menuitemradio",
						"aria-checked": option.id === presetId,
						className: "engine-suite-preset__option",
						onClick: () => selectPreset(option.id),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: presetDisplayName(option) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: option.id === presetId ? "✓" : "" })]
					}, option.id))
				}) : null]
			}) : null,
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				ref: triggerRef,
				type: "button",
				className: "engine-suite-trigger",
				"aria-haspopup": "dialog",
				"aria-expanded": open && !panelClosing,
				"aria-label": `选择引擎：${engineLabel}，${providerLabel}，${modelLabel}，${effortLabel}`,
				title: `${engineLabel} · ${providerLabel} · ${modelLabel} · ${effortLabel}`,
				disabled: locked,
				onClick: toggleOpen,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "engine-suite-trigger__icon",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
							name: "spark",
							size: 15
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "engine-suite-trigger__copy",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "engine-suite-trigger__value",
							children: [
								engineLabel,
								" ",
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "engine-suite-trigger__separator",
									children: "·"
								}),
								" ",
								modelLabel,
								" ",
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "engine-suite-trigger__separator",
									children: "·"
								}),
								" ",
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "engine-suite-trigger__effort",
									children: effortLabel
								})
							]
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "engine-suite-trigger__chevron",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
							name: "chevron",
							size: 14
						})
					})
				]
			}),
			selectionError === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				role: "status",
				className: "engine-suite-selection-error",
				children: selectionError
			}),
			open ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				role: "dialog",
				"aria-label": "引擎与模型选择",
				className: "engine-suite-popover",
				"data-state": panelClosing ? "closing" : "open",
				style: panelStyle,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "engine-suite-columns",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							className: `engine-suite-column${engineLocked ? " engine-suite-column--engine-locked" : ""}`,
							"aria-labelledby": "engine-suite-engine-label",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									id: "engine-suite-engine-label",
									className: "engine-suite-column__header",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "engine-suite-column__header-icon",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
											name: "engine",
											size: 14
										})
									}), "引擎"]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: "engine-suite-search",
									"aria-label": "搜索引擎",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "engine-suite-search__icon",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
											name: "search",
											size: 13
										})
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										className: "engine-suite-search__input",
										value: engineQuery,
										onChange: (event) => setEngineQuery(event.target.value),
										placeholder: "搜索引擎"
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "engine-suite-list",
									role: "listbox",
									"aria-label": "引擎列表",
									children: filteredEngines.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: "engine-suite-empty",
										children: "没有匹配的引擎"
									}) : filteredEngines.map((engine) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										role: "option",
										"aria-selected": engine.id === engineId,
										className: "engine-suite-option",
										disabled: engineLocked || selectionBusy,
										style: optionStyle(engine.id === engineId),
										onClick: () => chooseEngine(engine.id),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "engine-suite-option__mark",
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
												name: "check",
												size: 11
											})
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: "engine-suite-option__copy",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "engine-suite-option__title",
												children: engine.displayName
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "engine-suite-option__meta",
												children: engineMeta(engine)
											})]
										})]
									}, engine.id))
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							className: "engine-suite-column",
							"aria-labelledby": "engine-suite-provider-label",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									id: "engine-suite-provider-label",
									className: "engine-suite-column__header",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "engine-suite-column__header-icon",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
											name: "provider",
											size: 14
										})
									}), "服务商"]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: "engine-suite-search",
									"aria-label": "搜索服务商",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "engine-suite-search__icon",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
											name: "search",
											size: 13
										})
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										className: "engine-suite-search__input",
										value: providerQuery,
										onChange: (event) => setProviderQuery(event.target.value),
										placeholder: "搜索服务商"
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "engine-suite-list",
									role: "listbox",
									"aria-label": "服务商列表",
									children: filteredProviders.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: "engine-suite-empty",
										children: "当前引擎暂无可用服务商"
									}) : filteredProviders.map((provider) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										role: "option",
										"aria-selected": provider.id === providerId,
										className: "engine-suite-option",
										disabled: locked || selectionBusy,
										style: optionStyle(provider.id === providerId),
										onClick: () => chooseProvider(provider.id),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "engine-suite-option__mark",
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
												name: "check",
												size: 11
											})
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: "engine-suite-option__copy",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "engine-suite-option__title",
												children: provider.name
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "engine-suite-option__meta",
												children: providerMeta(provider)
											})]
										})]
									}, provider.id))
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							className: "engine-suite-column",
							"aria-labelledby": "engine-suite-model-label",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									id: "engine-suite-model-label",
									className: "engine-suite-column__header",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "engine-suite-column__header-icon",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
											name: "model",
											size: 14
										})
									}), "模型"]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: "engine-suite-search",
									"aria-label": "搜索模型",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "engine-suite-search__icon",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
											name: "search",
											size: 13
										})
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										className: "engine-suite-search__input",
										value: modelQuery,
										onChange: (event) => setModelQuery(event.target.value),
										placeholder: "搜索模型"
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "engine-suite-list",
									role: "listbox",
									"aria-label": "模型列表",
									children: filteredModels.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: "engine-suite-empty",
										children: "当前服务商暂无可用模型"
									}) : filteredModels.map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										role: "option",
										"aria-selected": model.id === modelRecordId,
										className: "engine-suite-option",
										disabled: locked || selectionBusy,
										style: optionStyle(model.id === modelRecordId),
										onClick: () => chooseModel(model.id),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "engine-suite-option__mark",
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
												name: "check",
												size: 11
											})
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: "engine-suite-option__copy",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "engine-suite-option__title",
												children: displayModel(model)
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "engine-suite-option__meta",
												children: contextLabel(model) ?? model.modelId
											})]
										})]
									}, model.id))
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							className: "engine-suite-column",
							"aria-labelledby": "engine-suite-reasoning-label",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								id: "engine-suite-reasoning-label",
								className: "engine-suite-column__header",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "engine-suite-column__header-icon",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
										name: "reasoning",
										size: 14
									})
								}), "强度"]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "engine-suite-effort-list",
								role: "listbox",
								"aria-label": "模型强度",
								children: reasoningOptions.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "engine-suite-empty",
									children: "当前模型没有公布强度选项"
								}) : reasoningOptions.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									role: "option",
									"aria-selected": option.id === reasoningEffort,
									className: "engine-suite-option engine-suite-effort",
									disabled: locked || selectionBusy,
									style: optionStyle(option.id === reasoningEffort),
									onClick: () => {
										setReasoningEffort(option.id);
										applySelection(currentSelection({ reasoningEffort: option.id }));
										closePanel();
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "engine-suite-effort__label",
										children: option.id
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "engine-suite-option__mark",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
											name: "check",
											size: 11
										})
									})]
								}, option.id))
							})]
						})
					]
				})
			}) : null
		]
	});
}
//#endregion
//#region src/client/catalog.ts
function remoteError(result) {
	return /* @__PURE__ */ new Error(`${result.error.code}: ${result.error.message}`);
}
function createEngineSuiteCatalogController(remote) {
	let snapshot = {
		status: "idle",
		catalog: null,
		error: null
	};
	const listeners = /* @__PURE__ */ new Set();
	let inFlight;
	const publish = (next) => {
		snapshot = next;
		for (const listener of [...listeners]) listener();
	};
	const refresh = () => {
		if (inFlight !== void 0) return inFlight;
		publish({
			...snapshot,
			status: "loading",
			error: null
		});
		inFlight = remote.catalog().then((result) => {
			if (!result.ok) throw remoteError(result);
			publish({
				status: "ready",
				catalog: result.value,
				error: null
			});
			return result.value;
		}).catch((error) => {
			publish({
				...snapshot,
				status: "error",
				error: error instanceof Error ? error.message : String(error)
			});
			throw error;
		}).finally(() => {
			inFlight = void 0;
		});
		return inFlight;
	};
	return {
		getSnapshot: () => snapshot,
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		refresh,
		discoverModels: async (providerId) => {
			const result = await remote.discoverModels(providerId);
			if (!result.ok) throw remoteError(result);
			const models = result.value.models;
			const current = snapshot.catalog;
			if (current !== null) publish({
				status: "ready",
				error: null,
				catalog: {
					...current,
					models: [...current.models.filter((model) => model.providerId !== providerId), ...models]
				}
			});
			return models;
		},
		createAgent: async (request) => {
			const result = await remote.createAgent(request);
			if (!result.ok) throw remoteError(result);
			return result.value;
		},
		switchAgent: async (request) => {
			const result = await remote.switchAgent(request);
			if (!result.ok) throw remoteError(result);
			return result.value;
		},
		listCommands: async (sessionId, refresh = true) => {
			const result = await remote.sessionCommands(sessionId, refresh);
			if (!result.ok) throw remoteError(result);
			return result.value.commands;
		}
	};
}
//#endregion
//#region src/client/EngineSuiteSection.tsx
function useSettings(scope) {
	const [snapshot, setSnapshot] = (0, react.useState)(scope.getSnapshot());
	(0, react.useEffect)(() => {
		setSnapshot(scope.getSnapshot());
		return scope.subscribe(() => setSnapshot(scope.getSnapshot()));
	}, [scope]);
	return snapshot;
}
function useCatalog(controller) {
	return (0, react.useSyncExternalStore)(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
}
function upsertProvider(providers, input) {
	const existing = providers.findIndex((provider) => provider.id === input.id);
	if (existing < 0) return [...providers, input];
	const next = [...providers];
	next[existing] = input;
	return next;
}
function upsertModel(models, input) {
	const existing = models.findIndex((model) => model.id === input.id);
	if (existing < 0) return [...models, input];
	const next = [...models];
	next[existing] = input;
	return next;
}
function upsertProfile(profiles, input) {
	const existing = profiles.findIndex((profile) => profile.id === input.id);
	if (existing < 0) return [...profiles, input];
	const next = [...profiles];
	next[existing] = input;
	return next;
}
function upsertSkillSet(sets, input) {
	const existing = sets.findIndex((set) => set.id === input.id);
	if (existing < 0) return [...sets, input];
	const next = [...sets];
	next[existing] = input;
	return next;
}
function upsertMcpSet(sets, input) {
	const existing = sets.findIndex((set) => set.id === input.id);
	if (existing < 0) return [...sets, input];
	const next = [...sets];
	next[existing] = input;
	return next;
}
function modelFromCatalog(model) {
	return {
		id: model.id,
		engineId: model.engineId,
		providerId: model.providerId,
		modelId: model.modelId,
		...model.displayName === void 0 ? {} : { displayName: model.displayName },
		enabled: model.enabled,
		hidden: model.hidden,
		reasoningOptions: model.reasoningOptions.map((option) => option.id),
		...model.defaultReasoningEffort === void 0 ? {} : { defaultReasoningEffort: model.defaultReasoningEffort },
		...model.contextWindowTokens === void 0 ? {} : { contextWindowTokens: model.contextWindowTokens },
		contextWindowSource: model.contextWindowSource
	};
}
function EngineSuiteSection({ scope, catalog: controller }) {
	const snapshot = useSettings(scope);
	const catalog = useCatalog(controller);
	const providers = snapshot.value?.providers ?? [];
	const models = snapshot.value?.models ?? [];
	const profiles = snapshot.value?.profiles ?? [];
	const skillSets = snapshot.value?.skillSets ?? [];
	const mcpSets = snapshot.value?.mcpSets ?? [];
	const [engineId, setEngineId] = (0, react.useState)("claude-cli");
	const [providerId, setProviderId] = (0, react.useState)("glm-opencodebay");
	const [providerName, setProviderName] = (0, react.useState)("GLM (OpenCodeBay)");
	const [baseUri, setBaseUri] = (0, react.useState)("https://sub2api.opencodebay.com");
	const [credentialRef, setCredentialRef] = (0, react.useState)("ANTHROPIC_AUTH_TOKEN");
	const [modelRecordId, setModelRecordId] = (0, react.useState)("glm-opencodebay/glm-5.3");
	const [modelId, setModelId] = (0, react.useState)("glm-5.3");
	const [displayName, setDisplayName] = (0, react.useState)("GLM 5.3");
	const [reasoningOptions, setReasoningOptions] = (0, react.useState)("low,medium,high,xhigh,max");
	const [defaultReasoningEffort, setDefaultReasoningEffort] = (0, react.useState)("max");
	const [contextWindowTokens, setContextWindowTokens] = (0, react.useState)("");
	const [is1M, setIs1M] = (0, react.useState)(false);
	const [profileId, setProfileId] = (0, react.useState)("");
	const [profileName, setProfileName] = (0, react.useState)("");
	const [allowedChildProfiles, setAllowedChildProfiles] = (0, react.useState)("");
	const [maxChildDepth, setMaxChildDepth] = (0, react.useState)("1");
	const [maxConcurrentChildren, setMaxConcurrentChildren] = (0, react.useState)("1");
	const [skillSetRef, setSkillSetRef] = (0, react.useState)("");
	const [mcpSetRef, setMcpSetRef] = (0, react.useState)("");
	const [skillSetId, setSkillSetId] = (0, react.useState)("");
	const [skillPluginDirs, setSkillPluginDirs] = (0, react.useState)("");
	const [skillAdditionalDirectories, setSkillAdditionalDirectories] = (0, react.useState)("");
	const [mcpSetId, setMcpSetId] = (0, react.useState)("");
	const [mcpServerId, setMcpServerId] = (0, react.useState)("engine-suite-server");
	const [mcpServerName, setMcpServerName] = (0, react.useState)("Engine Suite MCP Server");
	const [mcpTransport, setMcpTransport] = (0, react.useState)("stdio");
	const [mcpCommand, setMcpCommand] = (0, react.useState)("");
	const [mcpArgs, setMcpArgs] = (0, react.useState)("");
	const [mcpUrl, setMcpUrl] = (0, react.useState)("");
	const [message, setMessage] = (0, react.useState)();
	const catalogProviders = catalog.catalog?.providers.filter((provider) => provider.engineId === engineId) ?? [];
	const catalogModels = catalog.catalog?.models.filter((model) => model.providerId === providerId) ?? [];
	const writable = snapshot.status === "ready" && snapshot.writable;
	(0, react.useEffect)(() => {
		const configured = providers.find((provider) => provider.id === providerId);
		if (configured !== void 0) {
			setProviderName(configured.name);
			setBaseUri(configured.baseUri);
			setCredentialRef(configured.credentialRef);
			return;
		}
		const discovered = catalogProviders.find((provider) => provider.id === providerId);
		if (discovered === void 0) return;
		setProviderName(discovered.name);
		setBaseUri(discovered.baseUri);
	}, [
		catalogProviders,
		providerId,
		providers
	]);
	(0, react.useEffect)(() => {
		const configured = models.find((model) => model.id === modelRecordId);
		const discovered = catalogModels.find((model) => model.id === modelRecordId);
		const selected = configured ?? discovered;
		if (selected === void 0) return;
		setModelId(selected.modelId);
		setDisplayName(selected.displayName ?? "");
		setReasoningOptions(selected.reasoningOptions.join(","));
		setDefaultReasoningEffort(selected.defaultReasoningEffort ?? "");
		setContextWindowTokens(selected.contextWindowTokens === void 0 ? "" : String(selected.contextWindowTokens));
		setIs1M(selected.contextWindowTokens === 1e6);
	}, [
		catalogModels,
		modelRecordId,
		models
	]);
	const saveProvider = async (event) => {
		event.preventDefault();
		const provider = {
			id: providerId.trim(),
			engineId,
			name: providerName.trim(),
			baseUri: baseUri.trim(),
			credentialRef: credentialRef.trim(),
			wireApi: engineId === "claude-cli" ? "anthropic" : "responses",
			authMode: engineId === "claude-cli" ? "auth-token" : "api-key",
			enabled: true
		};
		try {
			await scope.set("providers", upsertProvider(providers, provider));
			await controller.refresh().catch(() => void 0);
			setMessage(`Saved provider ${provider.id}`);
		} catch (error) {
			setMessage(error instanceof Error ? error.message : String(error));
		}
	};
	const saveModel = async (event) => {
		event.preventDefault();
		const options = reasoningOptions.split(",").map((value) => value.trim()).filter(Boolean);
		const model = {
			id: modelRecordId.trim(),
			engineId,
			providerId: providerId.trim(),
			modelId: modelId.trim(),
			...displayName.trim() === "" ? {} : { displayName: displayName.trim() },
			enabled: true,
			hidden: false,
			reasoningOptions: options,
			...defaultReasoningEffort.trim() === "" ? {} : { defaultReasoningEffort: defaultReasoningEffort.trim() },
			...contextWindowTokens.trim() === "" ? {} : {
				contextWindowTokens: Number(contextWindowTokens),
				contextWindowSource: "manual"
			},
			contextWindowSource: contextWindowTokens.trim() === "" ? "unknown" : "manual"
		};
		try {
			await scope.set("models", upsertModel(models, model));
			await controller.refresh().catch(() => void 0);
			setMessage(`Saved model ${model.modelId}`);
		} catch (error) {
			setMessage(error instanceof Error ? error.message : String(error));
		}
	};
	const saveProfile = async (event) => {
		event.preventDefault();
		const id = profileId.trim();
		if (id === "") {
			setMessage("Profile ID is required");
			return;
		}
		const profile = {
			id,
			...profileName.trim() === "" ? {} : { name: profileName.trim() },
			engineId,
			providerId: providerId.trim(),
			modelRecordId: modelRecordId.trim(),
			...defaultReasoningEffort.trim() === "" ? {} : { reasoningEffort: defaultReasoningEffort.trim() },
			...skillSetRef.trim() === "" ? {} : { skillSetRef: skillSetRef.trim() },
			...mcpSetRef.trim() === "" ? {} : { mcpSetRef: mcpSetRef.trim() },
			allowedChildProfiles: allowedChildProfiles.split(",").map((value) => value.trim()).filter(Boolean),
			maxChildDepth: Number(maxChildDepth),
			maxConcurrentChildren: Number(maxConcurrentChildren),
			enabled: true
		};
		try {
			await scope.set("profiles", upsertProfile(profiles, profile));
			setMessage(`Saved profile ${profile.id}`);
		} catch (error) {
			setMessage(error instanceof Error ? error.message : String(error));
		}
	};
	const saveSkillSet = async (event) => {
		event.preventDefault();
		const id = skillSetId.trim();
		if (id === "") {
			setMessage("Skill set ID is required");
			return;
		}
		const set = {
			id,
			pluginDirs: skillPluginDirs.split("\n").map((value) => value.trim()).filter(Boolean),
			additionalDirectories: skillAdditionalDirectories.split("\n").map((value) => value.trim()).filter(Boolean)
		};
		try {
			await scope.set("skillSets", upsertSkillSet(skillSets, set));
			setMessage(`Saved skill set ${set.id}`);
		} catch (error) {
			setMessage(error instanceof Error ? error.message : String(error));
		}
	};
	const saveMcpSet = async (event) => {
		event.preventDefault();
		const id = mcpSetId.trim();
		if (id === "") {
			setMessage("MCP set ID is required");
			return;
		}
		const serverId = mcpServerId.trim();
		const serverName = mcpServerName.trim();
		if (serverId === "" || serverName === "") {
			setMessage("MCP server ID and name are required");
			return;
		}
		let server;
		if (mcpTransport === "stdio") {
			const command = mcpCommand.trim();
			if (command === "") {
				setMessage("MCP command is required for stdio transport");
				return;
			}
			const args = mcpArgs.split(",").map((value) => value.trim()).filter(Boolean);
			server = {
				id: serverId,
				name: serverName,
				transport: "stdio",
				command,
				...args.length === 0 ? {} : { args }
			};
		} else {
			const url = mcpUrl.trim();
			if (url === "") {
				setMessage("MCP URL is required for HTTP transport");
				return;
			}
			server = {
				id: serverId,
				name: serverName,
				transport: "http",
				url
			};
		}
		const set = {
			id,
			servers: [server]
		};
		try {
			await scope.set("mcpSets", upsertMcpSet(mcpSets, set));
			setMessage(`Saved MCP set ${set.id}`);
		} catch (error) {
			setMessage(error instanceof Error ? error.message : String(error));
		}
	};
	const discover = async () => {
		if (providerId.trim() === "") return;
		setMessage("Discovering models…");
		try {
			const discovered = await controller.discoverModels(providerId.trim());
			const discoveredSettings = discovered.map(modelFromCatalog);
			if (discoveredSettings.length > 0) {
				await scope.set("models", [...models.filter((model) => model.providerId !== providerId), ...discoveredSettings]);
				const first = discoveredSettings[0];
				if (first === void 0) throw new Error("model discovery returned no model");
				setModelRecordId(first.id);
				setModelId(first.modelId);
				setDisplayName(first.displayName ?? "");
				setReasoningOptions(first.reasoningOptions.join(","));
				setDefaultReasoningEffort(first.defaultReasoningEffort ?? "");
				setContextWindowTokens(first.contextWindowTokens === void 0 ? "" : String(first.contextWindowTokens));
				setIs1M(first.contextWindowTokens === 1e6);
			}
			setMessage(`Discovered ${discovered.length} model(s)`);
		} catch (error) {
			setMessage(error instanceof Error ? error.message : String(error));
		}
	};
	const currentProviderModels = catalog.catalog?.models.filter((model) => model.providerId === providerId) ?? [];
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		"aria-labelledby": "engine-suite-settings-title",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
				id: "engine-suite-settings-title",
				children: "Engine Suite"
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "Configure the three-level route: engine → provider → model and reasoning effort." }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
				"data-status": snapshot.status,
				children: ["Settings status: ", snapshot.status]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: ["Configured providers: ", providers.length] }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: ["Configured models: ", models.length] }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: ["Configured profiles: ", profiles.length] }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
				"Configured Skill sets: ",
				skillSets.length,
				" · MCP sets: ",
				mcpSets.length
			] }),
			catalog.status === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
				role: "alert",
				children: ["Catalog: ", catalog.error]
			}) : null,
			message === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				role: "status",
				children: message
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
				onSubmit: saveProvider,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: "1. Engine and provider" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["Engine", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
						value: engineId,
						onChange: (event) => setEngineId(event.target.value),
						disabled: !writable,
						children: (catalog.catalog?.engines ?? []).map((engine) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: engine.id,
							children: engine.displayName
						}, engine.id))
					})] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["Provider", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
						value: providerId,
						onChange: (event) => setProviderId(event.target.value),
						disabled: !writable,
						children: [.../* @__PURE__ */ new Set([...catalogProviders.map((provider) => provider.id), ...providers.filter((provider) => provider.engineId === engineId).map((provider) => provider.id)])].map((id) => {
							const provider = catalogProviders.find((candidate) => candidate.id === id) ?? providers.find((candidate) => candidate.id === id);
							return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: id,
								children: provider?.name ?? id
							}, id);
						})
					})] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["Provider ID", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						value: providerId,
						onChange: (event) => setProviderId(event.target.value),
						disabled: !writable
					})] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["Name", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						value: providerName,
						onChange: (event) => setProviderName(event.target.value),
						disabled: !writable
					})] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["Base URI", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						value: baseUri,
						onChange: (event) => setBaseUri(event.target.value),
						disabled: !writable
					})] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["Credential reference", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						value: credentialRef,
						onChange: (event) => setCredentialRef(event.target.value),
						disabled: !writable
					})] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "submit",
						disabled: !writable,
						children: "Save provider"
					})
				]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
				onSubmit: saveModel,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: "2. Model and reasoning" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["Discovered model", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
						value: modelRecordId,
						onChange: (event) => setModelRecordId(event.target.value),
						disabled: !writable || currentProviderModels.length === 0,
						children: currentProviderModels.map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: model.id,
							children: model.displayName ?? model.modelId
						}, model.id))
					})] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => void discover(),
						disabled: !writable || providerId.trim() === "",
						children: "Explore model list"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["Model record ID", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						value: modelRecordId,
						onChange: (event) => setModelRecordId(event.target.value),
						disabled: !writable
					})] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["Model ID", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						value: modelId,
						onChange: (event) => setModelId(event.target.value),
						disabled: !writable
					})] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["Display name", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						value: displayName,
						onChange: (event) => setDisplayName(event.target.value),
						disabled: !writable
					})] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["Reasoning options (comma-separated)", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						value: reasoningOptions,
						onChange: (event) => setReasoningOptions(event.target.value),
						disabled: !writable
					})] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["Default reasoning effort", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						value: defaultReasoningEffort,
						onChange: (event) => setDefaultReasoningEffort(event.target.value),
						disabled: !writable
					})] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["Context window tokens", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						value: contextWindowTokens,
						onChange: (event) => {
							setContextWindowTokens(event.target.value);
							setIs1M(Number(event.target.value) === 1e6);
						},
						disabled: !writable || is1M
					})] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						type: "checkbox",
						checked: is1M,
						onChange: (event) => {
							setIs1M(event.target.checked);
							setContextWindowTokens(event.target.checked ? "1000000" : "");
						},
						disabled: !writable
					}), "1M context model"] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "submit",
						disabled: !writable || modelId.trim() === "",
						children: "Save model"
					})
				]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: "Advanced Agent Profile (MCP / Skill / child Agent policy)" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
				onSubmit: saveProfile,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["Profile ID", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						value: profileId,
						onChange: (event) => setProfileId(event.target.value),
						disabled: !writable
					})] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["Profile name", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						value: profileName,
						onChange: (event) => setProfileName(event.target.value),
						disabled: !writable
					})] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["Allowed child profile IDs (comma-separated)", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						value: allowedChildProfiles,
						onChange: (event) => setAllowedChildProfiles(event.target.value),
						disabled: !writable
					})] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["Max child depth", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						type: "number",
						min: "0",
						step: "1",
						value: maxChildDepth,
						onChange: (event) => setMaxChildDepth(event.target.value),
						disabled: !writable
					})] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["Max concurrent children", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						type: "number",
						min: "1",
						step: "1",
						value: maxConcurrentChildren,
						onChange: (event) => setMaxConcurrentChildren(event.target.value),
						disabled: !writable
					})] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["Skill set reference", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						value: skillSetRef,
						onChange: (event) => setSkillSetRef(event.target.value),
						disabled: !writable
					})] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["MCP set reference", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						value: mcpSetRef,
						onChange: (event) => setMcpSetRef(event.target.value),
						disabled: !writable
					})] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "submit",
						disabled: !writable,
						children: "Save profile"
					})
				]
			})] }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: "Runtime Assets (Skill / MCP)" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
					onSubmit: saveSkillSet,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: "Skill set" }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["Skill set ID", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							value: skillSetId,
							onChange: (event) => setSkillSetId(event.target.value),
							disabled: !writable
						})] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["Plugin directories (one per line)", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
							value: skillPluginDirs,
							onChange: (event) => setSkillPluginDirs(event.target.value),
							disabled: !writable
						})] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["Additional directories (one per line)", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
							value: skillAdditionalDirectories,
							onChange: (event) => setSkillAdditionalDirectories(event.target.value),
							disabled: !writable
						})] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "submit",
							disabled: !writable,
							children: "Save Skill set"
						})
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
					onSubmit: saveMcpSet,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: "MCP set" }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["MCP set ID", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							value: mcpSetId,
							onChange: (event) => setMcpSetId(event.target.value),
							disabled: !writable
						})] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["Server ID", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							value: mcpServerId,
							onChange: (event) => setMcpServerId(event.target.value),
							disabled: !writable
						})] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["Server name", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							value: mcpServerName,
							onChange: (event) => setMcpServerName(event.target.value),
							disabled: !writable
						})] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["Transport", /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
							value: mcpTransport,
							onChange: (event) => setMcpTransport(event.target.value),
							disabled: !writable,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: "stdio",
								children: "stdio"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: "http",
								children: "http"
							})]
						})] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["Command", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							value: mcpCommand,
							onChange: (event) => setMcpCommand(event.target.value),
							disabled: !writable || mcpTransport !== "stdio"
						})] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["Arguments (comma-separated)", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							value: mcpArgs,
							onChange: (event) => setMcpArgs(event.target.value),
							disabled: !writable || mcpTransport !== "stdio"
						})] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["URL", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							value: mcpUrl,
							onChange: (event) => setMcpUrl(event.target.value),
							disabled: !writable || mcpTransport !== "http"
						})] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "submit",
							disabled: !writable,
							children: "Save MCP set"
						})
					]
				})
			] })
		]
	});
}
//#endregion
//#region src/client/cli-slash.ts
/** These commands belong to Harness itself and must not be sent to a local CLI. */
const HARNESS_COMMANDS = /* @__PURE__ */ new Set([
	"permission",
	"export",
	"feedback",
	"goal"
]);
function cliSelection(sessionId) {
	return getEngineSuiteSessionSelection(sessionId);
}
function isCliSelection(selection) {
	return selection?.engineId === "claude-cli" || selection?.engineId === "codex-cli";
}
function commandName(line) {
	const trimmed = line.trim();
	if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return void 0;
	const name = trimmed.slice(1).split(/\s/u, 1)[0]?.toLocaleLowerCase();
	return name === void 0 || name.length === 0 ? void 0 : name;
}
async function sessionCommands(sessionId) {
	const runtime = getEngineSuiteComposerRuntime();
	if (runtime === void 0) return [];
	return runtime.catalog.listCommands(sessionId, true);
}
function claim(sessionId, line, sessions) {
	return { claim: {
		token: line,
		submit: async (_args, _actx, images) => {
			if (images.length > 0) return {
				kind: "error",
				text: "CLI Slash Command 暂不支持图片附件"
			};
			const session = sessions.binding(sessionId)?.session;
			if (session === void 0) return {
				kind: "error",
				text: "当前 CLI Session 不可用"
			};
			const result = await session.prompt([{
				type: "text",
				text: line
			}], "queue");
			return result.ok ? { kind: "success" } : {
				kind: "error",
				text: result.error?.message ?? "CLI Slash Command 发送失败"
			};
		}
	} };
}
/** CLI-owned slash source; the host command source remains authoritative for native sessions. */
function createCliSlashSource(ctx) {
	ctx.get("inputTriggers");
	const sessions = ctx.get("sessions");
	return {
		trigger: "/",
		name: "engine-suite-cli",
		order: -100,
		showGroupTitle: false,
		candidates: async (session, request) => {
			if (!isCliSelection(cliSelection(session.sessionId))) return [];
			let commands;
			try {
				commands = await sessionCommands(session.sessionId);
			} catch {
				return [];
			}
			const query = request.query.toLocaleLowerCase();
			return commands.filter((command) => !HARNESS_COMMANDS.has(command.name.toLocaleLowerCase())).filter((command) => command.name.toLocaleLowerCase().startsWith(query)).map((command) => ({
				id: `engine-suite-cli/${command.name}`,
				label: command.name,
				detail: command.description,
				argumentHint: command.argumentHint,
				source: command.source
			}));
		},
		onPick: (pick) => {
			if (!isCliSelection(cliSelection(pick.session.sessionId))) return void 0;
			const name = pick.candidate.id.startsWith("engine-suite-cli/") ? pick.candidate.id.slice(17) : "";
			return claim(pick.session.sessionId, `/${name}`, sessions);
		},
		matchEnter: async (session, line) => {
			if (!isCliSelection(cliSelection(session.sessionId))) return void 0;
			const name = commandName(line);
			if (name === void 0 || HARNESS_COMMANDS.has(name)) return void 0;
			return claim(session.sessionId, line, sessions);
		},
		warm: () => void 0
	};
}
function mountCliSlashSource(ctx) {
	return ctx.get("inputTriggers").registerSource(createCliSlashSource(ctx));
}
//#endregion
//#region src/client/realtime-ui.ts
const PHASE_LABELS = {
	idle: "",
	working: "正在工作",
	thinking: "正在思考",
	tool: "正在运行工具",
	approval: "等待批准",
	question: "等待输入",
	completed: "已完成",
	failed: "执行失败",
	cancelled: "已取消"
};
const EMPTY_EVENTS = [];
function activityPhaseLabel(phase) {
	return PHASE_LABELS[phase];
}
/**
* Merge a provider increment without assuming whether it is a delta or a
* cumulative prefix. This is deliberately content based: no timer can make a
* final response look streamed, and a replayed prefix cannot duplicate text.
*/
function mergeIncrementalText(current, incoming) {
	if (incoming === "") return current;
	if (current === "") return incoming;
	if (incoming === current || incoming.startsWith(current)) return incoming;
	if (current.startsWith(incoming)) return current;
	const maximumOverlap = Math.min(current.length, incoming.length);
	for (let length = maximumOverlap; length > 0; length--) if (current.slice(-length) === incoming.slice(0, length)) return current + incoming.slice(length);
	return current + incoming;
}
function safeText(value) {
	if (typeof value === "string") return value;
	if (value === void 0 || value === null) return "";
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		return String(value);
	}
}
function contentText(value) {
	if (!Array.isArray(value)) return safeText(value);
	return value.map((block) => {
		if (typeof block !== "object" || block === null) return safeText(block);
		const record = block;
		if (record["type"] === "text" || record["type"] === "reasoning") return typeof record["text"] === "string" ? record["text"] : "";
		if (record["type"] === "tool-result") return contentText(record["content"]);
		if (record["type"] === "image") return "[图片]";
		return safeText(block);
	}).filter(Boolean).join("\n");
}
function turnOfNode(node) {
	const data = node.data;
	if (typeof data === "object" && data !== null) {
		const record = data;
		if (typeof record["turn"] === "number") return record["turn"];
		const root = record["root"];
		if (typeof root === "object" && root !== null && typeof root["turn"] === "number") return root.turn;
	}
	if (node.location.kind !== "turn" && node.location.kind !== "step") return void 0;
	const turn = node.location.turn;
	return typeof turn === "object" && turn !== null && typeof turn["turn"] === "number" ? turn.turn : void 0;
}
function activityItem(item) {
	return item;
}
function addAssistantItems(events, nodeKey, data, active) {
	let text = "";
	let lastKind;
	let reasoningRunning = false;
	data.blocks.forEach((block, index) => {
		if (block.kind === "text") {
			text = mergeIncrementalText(text, block.text);
			lastKind = "text";
			return;
		}
		if (block.kind === "reasoning") {
			lastKind = "reasoning";
			reasoningRunning = data.status === "running";
			if (active) events.push(activityItem({
				id: `${nodeKey}:reasoning:${index}`,
				kind: "reasoning",
				status: reasoningRunning ? "running" : "completed",
				title: "思考",
				text: block.text,
				detail: block.text
			}));
			return;
		}
		if (block.kind === "tool-call") {
			lastKind = "text";
			if (active) events.push(activityItem({
				id: `${nodeKey}:tool:${index}`,
				kind: "tool-call",
				status: data.status === "running" ? "running" : "completed",
				title: block.name || "工具调用",
				callId: block.callId,
				detail: block.argsRaw
			}));
		}
	});
	if (active && text !== "") events.push(activityItem({
		id: `${nodeKey}:assistant`,
		kind: "assistant",
		status: data.status === "running" ? "running" : data.status === "interrupted" ? "cancelled" : "completed",
		title: "回复",
		text,
		detail: text
	}));
	reasoningRunning = reasoningRunning && lastKind === "reasoning";
	return {
		text,
		reasoningRunning
	};
}
function addToolItem(events, nodeKey, root, active) {
	const settled = "kind" in root;
	const callName = settled ? root.call?.name ?? root.callId : root.name;
	if (!active) return !settled;
	const callDetail = settled ? root.call?.argsRaw : root.argsRaw;
	events.push(activityItem({
		id: `${nodeKey}:call`,
		kind: "tool-call",
		status: settled ? "completed" : "running",
		title: callName || "工具调用",
		callId: root.callId,
		...callDetail === void 0 ? {} : { detail: callDetail },
		...settled ? { seq: root.seq } : {}
	}));
	if (settled) events.push(activityItem({
		id: `${nodeKey}:result`,
		kind: "tool-result",
		status: root.isError ? "failed" : "completed",
		title: root.isError ? "工具失败" : "工具结果",
		callId: root.callId,
		detail: contentText(root.content),
		seq: root.seq
	}));
	return !settled;
}
function pendingDetail(item) {
	if (typeof item !== "object" || item === null) return safeText(item);
	const payload = item.payload;
	if (payload === void 0) return "";
	return safeText(payload);
}
function isAbortedTurn(snapshot, latestTurn) {
	if (latestTurn === void 0) return false;
	const reason = snapshot.chat.timeline.turns.get(latestTurn)?.end?.data.reason;
	return typeof reason === "object" && reason !== null && reason["kind"] === "aborted";
}
function latestTurnNumber(snapshot) {
	return snapshot.chat.timeline.turnOrder.at(-1);
}
function activeTurnNumber(snapshot) {
	for (const turn of [...snapshot.chat.timeline.turnOrder].reverse()) if (snapshot.chat.timeline.turns.get(turn)?.status === "open") return turn;
}
function terminalForSnapshot(snapshot, latestTurn, hasFailure, hasCancellation) {
	if (hasFailure) return "failed";
	if (hasCancellation) return "cancelled";
	if (latestTurn === void 0) return null;
	const end = snapshot.chat.timeline.turns.get(latestTurn)?.end;
	if (end === void 0) return null;
	const reason = end.data.reason;
	return typeof reason === "object" && reason !== null && reason["kind"] === "completed" ? "completed" : null;
}
/**
* Convert the Host's incrementally published ConversationSnapshot into the
* single Codex-style activity language shared by Claude, Codex, and DeepSeek.
* The snapshot is the live source; it is never rebuilt from final text.
*/
function createEngineSuiteRealtimeSnapshot(snapshot, selection) {
	const activeTurn = activeTurnNumber(snapshot);
	const latestTurn = activeTurn ?? latestTurnNumber(snapshot);
	const events = [];
	let liveText = "";
	let reasoningRunning = false;
	let runningTool = false;
	let hasCancellation = false;
	let hasFailure = false;
	let hasAssistantRunning = false;
	const seenToolCalls = /* @__PURE__ */ new Set();
	for (const nodeKey of snapshot.chat.order) {
		const node = snapshot.chat.nodes.get(nodeKey);
		if (node === void 0) continue;
		const nodeTurn = turnOfNode(node);
		if (latestTurn !== void 0 && nodeTurn !== void 0 && nodeTurn !== latestTurn) continue;
		if (node.kind === "assistant-step") {
			const data = node.data;
			const active = data.status === "running" && (snapshot.running || snapshot.composerPhase === "engaging" || activeTurn !== void 0);
			const result = addAssistantItems(events, nodeKey, data, active);
			if (active) {
				liveText = mergeIncrementalText(liveText, result.text);
				reasoningRunning ||= result.reasoningRunning;
			}
			hasAssistantRunning ||= data.status === "running";
			if (data.status === "interrupted") {
				hasCancellation = true;
				events.push(activityItem({
					id: `${nodeKey}:cancelled`,
					kind: "cancelled",
					status: "cancelled",
					title: "已取消",
					detail: "回复在完成前被停止。"
				}));
			}
			continue;
		}
		if (node.kind === "tool-call") {
			const root = node.data.root;
			if (root.callId !== void 0) seenToolCalls.add(root.callId);
			const active = snapshot.running || snapshot.composerPhase === "engaging" || activeTurn !== void 0;
			runningTool ||= addToolItem(events, nodeKey, root, active);
			continue;
		}
		if (node.kind === "turn-error") {
			const data = node.data;
			hasFailure = true;
			const errorDetail = [data.message, data.code].filter(Boolean).join(" · ");
			events.push(activityItem({
				id: `${nodeKey}:error`,
				kind: "error",
				status: "failed",
				title: "执行失败",
				...errorDetail === "" ? {} : { detail: errorDetail },
				...data.seq === void 0 ? {} : { seq: data.seq }
			}));
			continue;
		}
		if (node.kind === "turn-max-tokens") {
			hasFailure = true;
			events.push(activityItem({
				id: `${nodeKey}:max-tokens`,
				kind: "error",
				status: "failed",
				title: "回复达到长度上限",
				detail: "可以发送“继续”开始新的回合。"
			}));
		}
	}
	if (snapshot.partial !== null && (activeTurn === void 0 || snapshot.partial.turn === activeTurn)) {
		if (!snapshot.chat.order.some((nodeKey) => {
			const node = snapshot.chat.nodes.get(nodeKey);
			return node?.kind === "assistant-step" && node.data.turn === snapshot.partial?.turn;
		})) {
			const partialData = {
				status: "running",
				turn: snapshot.partial.turn,
				step: snapshot.partial.step,
				blocks: snapshot.partial.blocks,
				time: 0
			};
			const result = addAssistantItems(events, `partial:${snapshot.partial.turn}:${snapshot.partial.step}`, partialData, true);
			liveText = mergeIncrementalText(liveText, result.text);
			reasoningRunning ||= result.reasoningRunning;
			hasAssistantRunning = true;
		}
	}
	for (const call of snapshot.runningCalls) {
		if (seenToolCalls.has(call.callId)) continue;
		runningTool = true;
		events.push(activityItem({
			id: `running-call:${call.callId}`,
			kind: "tool-call",
			status: "running",
			title: call.name || "工具调用",
			callId: call.callId,
			detail: call.argsRaw,
			seq: call.time
		}));
	}
	const pendingApproval = snapshot.pending.find((item) => item.kind === "approval");
	const pendingQuestion = snapshot.pending.find((item) => item.kind === "question");
	if (pendingApproval !== void 0) events.push(activityItem({
		id: pendingApproval.key,
		kind: "approval",
		status: "pending",
		title: "需要批准工具调用",
		detail: pendingDetail(pendingApproval)
	}));
	if (pendingQuestion !== void 0) events.push(activityItem({
		id: pendingQuestion.key,
		kind: "question",
		status: "pending",
		title: "等待你的输入",
		detail: pendingDetail(pendingQuestion)
	}));
	if (snapshot.promptError !== null) {
		hasFailure = true;
		events.push(activityItem({
			id: `prompt-error:${snapshot.promptError.op}:${snapshot.promptError.error.code}`,
			kind: "error",
			status: "failed",
			title: snapshot.promptError.op === "stop" ? "停止失败" : "发送失败",
			detail: `${snapshot.promptError.error.message} · ${snapshot.promptError.error.code}`
		}));
	}
	if (snapshot.lastAgentError !== null) {
		hasFailure = true;
		events.push(activityItem({
			id: "agent-error",
			kind: "error",
			status: "failed",
			title: "引擎错误",
			detail: snapshot.lastAgentError
		}));
	}
	hasCancellation ||= isAbortedTurn(snapshot, latestTurn);
	const hasActiveWork = snapshot.running || snapshot.composerPhase === "engaging" || pendingApproval !== void 0 || pendingQuestion !== void 0 || runningTool || hasAssistantRunning;
	const phase = hasActiveWork ? pendingQuestion !== void 0 ? "question" : pendingApproval !== void 0 ? "approval" : runningTool ? "tool" : reasoningRunning ? "thinking" : "working" : hasFailure ? "failed" : hasCancellation ? "cancelled" : terminalForSnapshot(snapshot, latestTurn, hasFailure, hasCancellation) === "completed" ? "completed" : "idle";
	const terminal = terminalForSnapshot(snapshot, latestTurn, hasFailure, hasCancellation);
	const seenLiveToolCalls = /* @__PURE__ */ new Set();
	const deduplicatedEvents = events.filter((item) => {
		if (item.kind !== "tool-call" || item.callId === void 0) return true;
		if (seenLiveToolCalls.has(item.callId)) return false;
		seenLiveToolCalls.add(item.callId);
		return true;
	});
	const visibleEvents = hasActiveWork || phase === "failed" || phase === "cancelled" ? deduplicatedEvents : EMPTY_EVENTS;
	const step = activeTurn === void 0 ? void 0 : snapshot.chat.timeline.turns.get(activeTurn)?.steps.at(-1)?.step;
	return {
		sessionId: String(snapshot.sessionId),
		phase,
		working: hasActiveWork,
		stopAvailable: hasActiveWork,
		liveText,
		turn: activeTurn ?? null,
		step: step ?? null,
		terminal,
		...selection === void 0 ? {} : { selection },
		events: visibleEvents,
		ariaLabel: PHASE_LABELS[phase] === "" ? "引擎空闲" : `${PHASE_LABELS[phase]}${hasActiveWork ? "，可以停止" : ""}`
	};
}
/** Client-owned mirror for activity that survives a slot render boundary. */
function createEngineSuiteActivityStore() {
	const snapshots = /* @__PURE__ */ new Map();
	const listeners = /* @__PURE__ */ new Map();
	const publish = (sessionId, snapshot) => {
		if (snapshots.get(sessionId) === snapshot) return;
		snapshots.set(sessionId, snapshot);
		for (const listener of [...listeners.get(sessionId) ?? []]) listener();
	};
	return {
		getSnapshot: (sessionId) => snapshots.get(sessionId),
		subscribe: (sessionId, listener) => {
			const bucket = listeners.get(sessionId) ?? /* @__PURE__ */ new Set();
			bucket.add(listener);
			listeners.set(sessionId, bucket);
			return () => {
				bucket.delete(listener);
				if (bucket.size === 0) listeners.delete(sessionId);
			};
		},
		publish,
		clear: (sessionId) => {
			if (sessionId !== void 0) {
				snapshots.delete(sessionId);
				listeners.delete(sessionId);
				return;
			}
			snapshots.clear();
			listeners.clear();
		}
	};
}
function activityAriaAttributes(phase) {
	return {
		role: "status",
		ariaLive: "polite",
		dataState: phase
	};
}
//#endregion
//#region src/client/EngineSuiteRealtimeActivity.tsx
function routeLabel(selection) {
	if (selection === void 0) return void 0;
	return [
		selection.engineId,
		selection.providerId,
		selection.modelRecordId,
		selection.reasoningEffort
	].filter(Boolean).join(" · ");
}
function detailFor(item) {
	if (item.detail === void 0 || item.detail === "") return void 0;
	return item.detail;
}
function ActivityItem({ item }) {
	const detail = detailFor(item);
	const expandable = detail !== void 0;
	const statusLabel = item.status === "running" ? "进行中" : item.status === "pending" ? "等待处理" : item.status === "failed" ? "失败" : item.status === "cancelled" ? "已取消" : "已完成";
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
		className: "engine-suite-realtime__item",
		"data-kind": item.kind,
		"data-status": item.status,
		open: item.status === "running" || item.status === "pending",
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", {
			className: "engine-suite-realtime__summary",
			"aria-label": `${item.title}：${statusLabel}`,
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "engine-suite-realtime__marker",
					"aria-hidden": "true"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "engine-suite-realtime__item-title",
					children: item.title
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "engine-suite-realtime__item-status",
					children: statusLabel
				})
			]
		}), expandable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
			className: "engine-suite-realtime__detail",
			children: detail
		}) : null]
	});
}
function EngineSuiteRealtimeActivity({ session, activityStore, stop }) {
	const selection = getEngineSuiteSessionSelection(String(session.sessionId));
	const activity = (0, react.useMemo)(() => createEngineSuiteRealtimeSnapshot(session, selection), [selection, session]);
	(0, react.useEffect)(() => {
		activityStore.publish(activity.sessionId, activity);
	}, [activity, activityStore]);
	if (!activity.working && activity.phase !== "failed" && activity.phase !== "cancelled") return null;
	const route = routeLabel(activity.selection);
	const aria = activityAriaAttributes(activity.phase);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		className: "engine-suite-realtime",
		"data-engine-suite-realtime": "true",
		"data-state": aria.dataState,
		"data-working": activity.working || void 0,
		role: aria.role,
		"aria-live": aria.ariaLive,
		"aria-label": activity.ariaLabel,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: `
        .engine-suite-realtime { --engine-suite-realtime-accent: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4d8dff); width: min(100%, 760px); margin: 0 auto 8px; padding: 9px 12px; border: 1px solid color-mix(in srgb, var(--engine-suite-realtime-accent) 20%, transparent); border-radius: 13px; color: inherit; background: color-mix(in srgb, var(--engine-suite-realtime-accent) 4%, transparent); }
        .engine-suite-realtime__header { display: flex; align-items: center; gap: 8px; min-height: 24px; }
        .engine-suite-realtime__pulse { width: 8px; height: 8px; flex: 0 0 auto; border-radius: 999px; background: var(--engine-suite-realtime-accent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--engine-suite-realtime-accent) 12%, transparent); }
        [data-working="true"] .engine-suite-realtime__pulse { animation: engine-suite-realtime-pulse 1.3s ease-in-out infinite; }
        .engine-suite-realtime__title { font-size: 13px; font-weight: 650; }
        .engine-suite-realtime__route { min-width: 0; overflow: hidden; color: color-mix(in srgb, currentColor 58%, transparent); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
        .engine-suite-realtime__stop { margin-left: auto; min-height: 28px; padding: 3px 10px; border: 1px solid color-mix(in srgb, currentColor 18%, transparent); border-radius: 8px; color: inherit; background: transparent; cursor: pointer; font: inherit; font-size: 12px; }
        .engine-suite-realtime__stop:hover { border-color: var(--engine-suite-realtime-accent); background: color-mix(in srgb, var(--engine-suite-realtime-accent) 9%, transparent); }
        .engine-suite-realtime__stop:focus-visible, .engine-suite-realtime__summary:focus-visible { outline: 2px solid var(--engine-suite-realtime-accent); outline-offset: 2px; }
        .engine-suite-realtime__events { display: grid; gap: 3px; margin-top: 7px; }
        .engine-suite-realtime__item { border-top: 1px solid color-mix(in srgb, currentColor 9%, transparent); }
        .engine-suite-realtime__summary { display: flex; align-items: center; gap: 7px; min-height: 28px; cursor: pointer; list-style: none; font-size: 12px; }
        .engine-suite-realtime__summary::-webkit-details-marker { display: none; }
        .engine-suite-realtime__marker { width: 6px; height: 6px; flex: 0 0 auto; border-radius: 999px; background: color-mix(in srgb, currentColor 40%, transparent); }
        [data-status="running"] .engine-suite-realtime__marker { background: var(--engine-suite-realtime-accent); }
        [data-status="failed"] .engine-suite-realtime__marker, [data-status="cancelled"] .engine-suite-realtime__marker { background: #d45b65; }
        .engine-suite-realtime__item-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .engine-suite-realtime__item-status { margin-left: auto; color: color-mix(in srgb, currentColor 54%, transparent); font-size: 11px; }
        .engine-suite-realtime__detail { max-height: 180px; margin: 0 0 7px 13px; overflow: auto; color: color-mix(in srgb, currentColor 74%, transparent); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
        .engine-suite-realtime__live { margin: 7px 0 0 13px; color: color-mix(in srgb, currentColor 78%, transparent); font-size: 12px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
        @keyframes engine-suite-realtime-pulse { 0%, 100% { opacity: .46; transform: scale(.9); } 50% { opacity: 1; transform: scale(1); } }
        @media (max-width: 560px) { .engine-suite-realtime { width: 100%; padding: 8px 10px; border-radius: 11px; } .engine-suite-realtime__route { display: none; } .engine-suite-realtime__stop { padding-inline: 8px; } }
        @media (prefers-reduced-motion: reduce) { .engine-suite-realtime__pulse { animation: none; } }
      ` }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "engine-suite-realtime__header",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "engine-suite-realtime__pulse",
						"aria-hidden": "true"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "engine-suite-realtime__title",
						children: activityPhaseLabel(activity.phase)
					}),
					route === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "engine-suite-realtime__route",
						title: route,
						children: route
					}),
					activity.stopAvailable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "engine-suite-realtime__stop",
						"aria-label": "停止当前运行",
						onClick: () => {
							stop();
						},
						children: "停止"
					}) : null
				]
			}),
			activity.working && activity.events.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "engine-suite-realtime__live",
				children: "等待引擎返回首个事件…"
			}) : null,
			activity.liveText !== "" && activity.working ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "engine-suite-realtime__live",
				"data-live-assistant-text": "true",
				children: activity.liveText
			}) : null,
			activity.events.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "engine-suite-realtime__events",
				"data-timeline": "true",
				children: activity.events.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActivityItem, { item }, item.id))
			}) : null
		]
	});
}
//#endregion
//#region src/client/index.ts
/** The root half only needs the Remote service so it can mount this package's contribution. */
const inject = ["remote"];
function clientSessions(ctx) {
	return ctx.get("sessions");
}
function wait(milliseconds) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
async function openSessionWhenListed(ctx, sessionId) {
	const sessions = clientSessions(ctx);
	for (let attempt = 0; attempt < 40; attempt++) {
		if (sessions.list.getSnapshot().byId[sessionId] !== void 0) {
			sessions.open(sessionId);
			return;
		}
		await wait(50);
	}
	throw new Error(`created Engine Suite session was not announced: ${sessionId}`);
}
async function apply(ctx) {
	const disposeRemote = await ctx.remote.$mount(TYPERT_REMOTE);
	const child = ctx.plugin({
		inject: [
			"remote.engineSuiteGateway",
			"slots",
			"settingsScope",
			"sessions",
			"connection",
			"inputTriggers"
		],
		apply: (surfaceCtx) => {
			const gateway = surfaceCtx.remote.engineSuiteGateway;
			const agentPreset = createEngineSuiteAgentPresetFace(surfaceCtx.get("connection"));
			const catalog = createEngineSuiteCatalogController(gateway);
			const activityStore = createEngineSuiteActivityStore();
			const sessions = surfaceCtx.get("sessions");
			catalog.refresh().catch(() => void 0);
			setEngineSuiteComposerRuntime({
				catalog,
				createAgent: async (request) => {
					await catalog.createAgent(request);
				},
				openSession: (sessionId) => openSessionWhenListed(surfaceCtx, sessionId),
				switchAgent: async (request) => {
					await catalog.switchAgent(request);
				},
				setSessionSelection: setEngineSuiteSessionSelection
			});
			const disposeCliSlash = mountCliSlashSource(surfaceCtx);
			surfaceCtx.effect(() => disposeCliSlash, "engine-suite.cli-slash");
			surfaceCtx.slots.inject("settings.section", () => surfaceCtx.slots.register({
				name: "settings.section",
				id: "engine-suite",
				order: 20,
				label: "Engines",
				inject: () => ({
					scope: surfaceCtx.settingsScope.bind({ namespace: ENGINE_SUITE_SETTINGS_NAMESPACE }),
					catalog
				})
			}, EngineSuiteSection));
			surfaceCtx.slots.inject("conversation.hero.agentPreset", () => surfaceCtx.slots.register({
				name: "conversation.hero.agentPreset",
				priority: -100
			}, () => null));
			surfaceCtx.slots.inject("conversation.input.model", () => surfaceCtx.slots.register({
				name: "conversation.input.model",
				priority: -10,
				inject: () => ({ agentPreset })
			}, EngineSuiteComposerSelector));
			surfaceCtx.slots.inject("conversation.input.dock", () => surfaceCtx.slots.register({
				name: "conversation.input.dock",
				id: "engine-suite-realtime",
				order: -100,
				inject: (sessionId) => ({
					activityStore,
					stop: async () => {
						const conversation = sessions.scope(sessionId)?.get("conversation");
						if (conversation === void 0) throw new Error(`conversation unavailable for session ${String(sessionId)}`);
						await conversation.cancel();
					}
				})
			}, EngineSuiteRealtimeActivity));
			surfaceCtx.effect(() => () => activityStore.clear(), "engine-suite.realtime-activity-store");
		}
	});
	await child.await();
	return async () => {
		await child.dispose();
		setEngineSuiteComposerRuntime(void 0);
		await disposeRemote();
	};
}
//#endregion
exports.apply = apply;
exports.inject = inject;

    return module.exports;
  },
});
