export const mapQA = (qa) => {
    return {
        id: qa._id.toString(),
        productId: qa.productId.toString(),
        userId: qa.userId ? qa.userId.toString() : null,
        userName: qa.userName,
        question: qa.question,
        answer: qa.answer,
        status: qa.status,
        adminId: qa.adminId ? qa.adminId.toString() : null,
        createdAt: qa.createdAt,
        updatedAt: qa.updatedAt,
    };
};
export const mapAdminQA = (qa) => {
    return {
        ...mapQA(qa),
        productName: qa.productId?.name,
        productImage: qa.productId?.images?.[0],
        adminName: qa.adminId?.name,
    };
};
