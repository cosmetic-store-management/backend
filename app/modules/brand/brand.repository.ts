import Brand, {
  type BrandDocument,
  type IBrand,
} from "./models/brand.schema.js";

type Query = Record<string, any>;

export const findAll = async (query: Query, cursor: string | null, limit: number) => {
  if (cursor) query._id = { $lt: cursor };
  const brands = await Brand.find(query).sort({ _id: -1 }).limit(limit + 1).lean();
  
  const hasNextPage = brands.length > limit;
  const items = hasNextPage ? brands.slice(0, limit) : brands;
  const nextCursor = hasNextPage ? items[items.length - 1]._id.toString() : null;

  return { brands: items, nextCursor, hasNextPage, limit };
};

export const countAll = (query: Query) => Brand.countDocuments(query);

export const findById = (id: string) => Brand.findById(id);

export const findBySlug = (slug: string) => Brand.findOne({ slug });

export const findOneBy = (query: Query) => Brand.findOne(query);

export const create = (data: Partial<IBrand>) => Brand.create(data);

export const save = (brand: BrandDocument) => brand.save();

export const deleteById = (id: string) => Brand.findByIdAndDelete(id);
