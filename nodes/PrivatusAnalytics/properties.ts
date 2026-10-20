import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

import { SPEC, type SpecInput } from '../shared/request';
import { OPERATIONS, RESOURCES, type FieldDef, type OperationDef } from './operations';

/** utm_source becomes utmSource, the name of the node parameter. */
export const camel = (name: string): string =>
	name.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());

const WORDS: Record<string, string> = {
	id: 'ID',
	ids: 'IDs',
	url: 'URL',
	utm: 'UTM',
	dns: 'DNS',
	tcp: 'TCP',
	http: 'HTTP',
	ssl: 'SSL',
	api: 'API',
	csv: 'CSV',
	json: 'JSON',
	xlsx: 'XLSX',
	ndjson: 'NDJSON',
	zip: 'ZIP',
};

const titleCase = (text: string): string =>
	text
		.split('_')
		.map((word) => WORDS[word] ?? word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');

/** site_id becomes Site, utm_source becomes UTM Source. */
export const label = (name: string): string =>
	titleCase(name.replace(/_id$/, '').replace(/_ids$/, 's'));

/** The API reference text, shortened and without the names of API tools. */
export function describe(text: string | undefined): string | undefined {
	if (!text) return undefined;
	let clean = text
		.replace(/\s+/g, ' ')
		.replace(/\s*\((?:[^()]*?)from [a-z_]+_(?:list|get)\)/gi, '')
		.replace(/,? from [a-z_]+_(?:list|get)\b/gi, '')
		.replace(/, the id field returned by [a-z_]+/gi, '')
		.trim();
	if (clean.length > 500) {
		const cut = clean.slice(0, 500);
		const stop = cut.lastIndexOf('. ');
		clean = stop > 150 ? cut.slice(0, stop + 1) : `${cut.replace(/\s+\S*$/, '')}...`;
	}
	return clean.replace(/\.$/, '');
}

const placeholderInput = (name: string): SpecInput => ({ name, type: 'string' });

/** The documented input behind a field, or a plain text input for a field the node adds itself. */
export function inputOf(def: OperationDef, field: FieldDef): SpecInput {
	const operation = def.call ? SPEC[def.call] : undefined;
	return (
		operation?.inputs.find((input) => input.name === field.name) ?? placeholderInput(field.name)
	);
}

const isStructured = (input: SpecInput): boolean =>
	input.items === 'object' || input.items === 'array' || input.name === 'filters';

type FieldType = NonNullable<FieldDef['type']>;

function typeOf(field: FieldDef, input: SpecInput): FieldType {
	if (field.type) return field.type;
	const isList = input.type === 'array' && !isStructured(input);
	if (field.loader) return isList ? 'multiOptions' : 'options';
	if (field.choices) return isList ? 'multiOptions' : 'options';
	if (input.enum) return 'options';
	if (input.itemsEnum) return 'multiOptions';
	if (input.type === 'array' || input.type === 'object') return isList ? 'string' : 'json';
	if (input.type === 'integer' || input.type === 'number') return 'number';
	if (input.type === 'boolean') return 'boolean';
	return 'string';
}

const primitive = (value: unknown): value is string | number | boolean =>
	['string', 'number', 'boolean'].includes(typeof value);

export function propertyFor(def: OperationDef, field: FieldDef): INodeProperties {
	const input = inputOf(def, field);
	const type = typeOf(field, input);
	const choices: Array<[string, string]> | undefined =
		field.choices ??
		((input.enum ?? input.itemsEnum)?.map((value) => [String(value), titleCase(String(value))]) as
			| Array<[string, string]>
			| undefined);

	let fallback: unknown = '';
	if (type === 'number') fallback = 0;
	else if (type === 'boolean') fallback = false;
	else if (type === 'multiOptions') fallback = [];
	else if (type === 'options') fallback = choices?.[0]?.[0] ?? '';
	let value: unknown =
		field.default ?? (primitive(input.default) ? input.default : undefined) ?? fallback;
	if (type === 'multiOptions' && !Array.isArray(value)) value = [];
	if (type === 'options' && typeof value === 'number') value = String(value);

	const property: INodeProperties = {
		displayName: field.label ?? label(field.name),
		name: camel(field.name),
		type: type === 'text' ? 'string' : (type as INodeProperties['type']),
		default: value as INodeProperties['default'],
	};
	let description = field.description ?? describe(input.description);
	if (field.loader) {
		// The wording n8n uses for every dropdown that is filled from the service.
		const plural = type === 'multiOptions';
		property.displayName = `${property.displayName} ${plural ? 'Names or IDs' : 'Name or ID'}`;
		const choose = `Choose from the list, or specify ${plural ? 'IDs' : 'an ID'} using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.`;
		description = description ? `${description}. ${choose}` : choose;
	}
	if (description) property.description = description;
	if (field.required) property.required = true;
	if (field.placeholder) property.placeholder = field.placeholder;
	if (type === 'text') property.typeOptions = { rows: 4 };
	if (type === 'json') property.typeOptions = { rows: 3 };

	if (field.loader) {
		property.typeOptions = {
			...property.typeOptions,
			loadOptionsMethod: field.loader,
			...(field.dependsOn ? { loadOptionsDependsOn: field.dependsOn } : {}),
		};
	} else if ((type === 'options' || type === 'multiOptions') && choices) {
		property.options = choices.map(
			([optionValue, name]): INodePropertyOptions => ({ name, value: optionValue }),
		);
	}
	if (field.showWhen) property.displayOptions = { show: field.showWhen };
	return property;
}

/** All properties of the node: the resource, its operations and their fields. */
export function buildProperties(): INodeProperties[] {
	const properties: INodeProperties[] = [
		{
			displayName: 'Resource',
			name: 'resource',
			type: 'options',
			noDataExpression: true,
			options: [...RESOURCES]
				.sort((a, b) => a.name.localeCompare(b.name))
				.map(({ value, name, description }) => ({ name, value, description })),
			default: 'site',
		},
	];

	for (const resource of RESOURCES) {
		const operations = OPERATIONS.filter((def) => def.resource === resource.value).sort((a, b) =>
			a.name.localeCompare(b.name),
		);
		const firstOperation = operations[0].value;
		properties.push({
			displayName: 'Operation',
			name: 'operation',
			type: 'options',
			noDataExpression: true,
			displayOptions: { show: { resource: [resource.value] } },
			options: operations.map((def) => ({
				name: def.name,
				value: def.value,
				action: def.action,
				description: def.description,
			})),
			default: firstOperation,
		});
	}

	for (const def of OPERATIONS) {
		const show = { resource: [def.resource], operation: [def.value] };
		const own = def.fields.filter((field) => !field.extra).map((field) => propertyFor(def, field));
		own.forEach((property) => {
			property.displayOptions = {
				show: { ...show, ...(property.displayOptions?.show ?? {}) },
			};
			properties.push(property);
		});

		if (def.list) {
			properties.push(
				{
					displayName: 'Return All',
					name: 'returnAll',
					type: 'boolean',
					default: false,
					description: 'Whether to return all results or only up to a given limit',
					displayOptions: { show },
				},
				{
					displayName: 'Limit',
					name: 'limit',
					type: 'number',
					default: 50,
					description: 'Max number of results to return',
					typeOptions: { minValue: 1 },
					displayOptions: { show: { ...show, returnAll: [false] } },
				},
			);
		}

		const extras = def.fields.filter((field) => field.extra);
		if (extras.length) {
			const collection = def.collection ?? { name: 'additionalFields', label: 'Additional Fields' };
			properties.push({
				displayName: collection.label,
				name: collection.name,
				type: 'collection',
				placeholder: collection.name === 'filters' ? 'Add Filter' : 'Add Field',
				default: {},
				displayOptions: { show },
				options: extras
					.map((field) => propertyFor(def, field))
					.sort((a, b) => a.displayName.localeCompare(b.displayName)),
			});
		}
	}
	return properties;
}
