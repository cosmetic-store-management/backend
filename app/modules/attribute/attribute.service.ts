import * as attrRepo from "./attribute.repository.js";
import { mapAttribute } from "./dto/attribute.response.dto.js";
import { notFound, conflict } from "../../shared/errors/httpErrors.js";
import type {
  CreateAttributeInput,
  UpdateAttributeInput,
} from "./dto/attribute.request.dto.js";

export const getAllAttributes = async () => {
  const attrs = await attrRepo.findAll({}, 0, 100);
  return attrs.map(mapAttribute);
};

export const getAttributeDetail = async (id: string) => {
  const attr = await attrRepo.findById(id);
  if (!attr) throw notFound("Không tìm thấy thuộc tính");
  return mapAttribute(attr);
};

export const createAttribute = async (data: CreateAttributeInput) => {
  const existing = await attrRepo.findByCode(data.code);
  if (existing) throw conflict("Mã code thuộc tính đã tồn tại");
  const newAttr = await attrRepo.create(data);
  return mapAttribute(newAttr);
};

export const updateAttribute = async (
  id: string,
  data: UpdateAttributeInput,
) => {
  const attr = await attrRepo.findById(id);
  if (!attr) throw notFound("Không tìm thấy thuộc tính");

  if (data.name !== undefined) attr.name = data.name;
  if (data.values !== undefined) attr.values = data.values;

  await attrRepo.save(attr);
  return mapAttribute(attr);
};

export const deleteAttribute = async (id: string) => {
  const attr = await attrRepo.findById(id);
  if (!attr) throw notFound("Không tìm thấy thuộc tính");
  await attrRepo.deleteById(id);
};
