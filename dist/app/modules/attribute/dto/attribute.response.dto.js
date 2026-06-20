export const mapAttribute = (attr) => ({
    id: attr._id.toString(),
    name: attr.name,
    code: attr.code,
    values: attr.values,
});
