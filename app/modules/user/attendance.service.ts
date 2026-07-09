import Attendance from "./models/attendance.schema.js";
import ShiftSchedule from "./models/shift-schedule.schema.js";
import User from "./models/user.schema.js";
import Order from "../order/models/order.schema.js";
import PayrollPeriod from "./models/payroll-period.schema.js";
import { badRequest, notFound } from "../../shared/errors/httpErrors.js";
import mongoose from "mongoose";

// Helper to get local date string YYYY-MM-DD
export const getLocalDateString = (date = new Date()): string => {
  // sv-SE locale formatting yields YYYY-MM-DD
  return date.toLocaleDateString("sv-SE");
};

// Check-in flow
export const checkIn = async (citizenIdLast4: string) => {
  if (!citizenIdLast4 || citizenIdLast4.length !== 4) {
    throw badRequest("Mã PIN (4 số cuối CCCD) không hợp lệ");
  }

  // Find user by matching the last 4 characters of citizenId
  const user = await User.findOne({
    citizenId: { $regex: new RegExp(`${citizenIdLast4}$`) },
    role: { $in: ["manager", "staff"] },
    isDeleted: { $ne: true },
  });

  if (!user) {
    throw notFound("Không tìm thấy nhân viên với mã PIN này");
  }

  const todayStr = getLocalDateString();
  const existing = await Attendance.findOne({ userId: user._id, date: todayStr });

  if (existing && existing.checkIn) {
    throw badRequest(`Nhân viên ${user.name} đã chấm công vào hôm nay lúc ${existing.checkIn.toLocaleTimeString("vi-VN")}`);
  }

  const now = new Date();
  
  // Determine shift start time to calculate lateness
  const assignedShift = await ShiftSchedule.findOne({ userId: user._id, date: todayStr });
  const shiftType = assignedShift?.shiftType || user.workingShift || "full";

  let status: "present" | "late" = "present";
  const localHour = now.getHours();
  const localMinute = now.getMinutes();
  const totalMinutes = localHour * 60 + localMinute;

  // Lateness rules (lateness buffer: 15 minutes)
  // Morning shift: starts at 08:00 (Buffer limit: 08:15 = 495 mins)
  // Afternoon shift: starts at 13:00 (Buffer limit: 13:15 = 795 mins)
  // Night shift: starts at 18:00 (Buffer limit: 18:15 = 1095 mins)
  // Full shift: starts at 08:00 (Buffer limit: 08:15 = 495 mins)
  if (shiftType === "morning" || shiftType === "full") {
    if (totalMinutes > 495) status = "late";
  } else if (shiftType === "afternoon") {
    if (totalMinutes > 795) status = "late";
  } else if (shiftType === "night") {
    if (totalMinutes > 1095) status = "late";
  }

  let record;
  if (existing) {
    existing.checkIn = now;
    existing.status = status;
    await existing.save();
    record = existing;
  } else {
    record = await Attendance.create({
      userId: user._id,
      date: todayStr,
      checkIn: now,
      status,
    });
  }

  return {
    employeeName: user.name,
    employeeId: user.employeeId,
    checkInTime: now,
    status,
    shiftType,
  };
};

// Check-out flow
export const checkOut = async (citizenIdLast4: string) => {
  if (!citizenIdLast4 || citizenIdLast4.length !== 4) {
    throw badRequest("Mã PIN (4 số cuối CCCD) không hợp lệ");
  }

  const user = await User.findOne({
    citizenId: { $regex: new RegExp(`${citizenIdLast4}$`) },
    role: { $in: ["manager", "staff"] },
    isDeleted: { $ne: true },
  });

  if (!user) {
    throw notFound("Không tìm thấy nhân viên với mã PIN này");
  }

  const todayStr = getLocalDateString();
  const attendance = await Attendance.findOne({ userId: user._id, date: todayStr });

  if (!attendance || !attendance.checkIn) {
    throw badRequest(`Nhân viên ${user.name} chưa chấm công vào hôm nay!`);
  }

  if (attendance.checkOut) {
    throw badRequest(`Nhân viên ${user.name} đã chấm công ra hôm nay lúc ${attendance.checkOut.toLocaleTimeString("vi-VN")}`);
  }

  const now = new Date();
  attendance.checkOut = now;
  await attendance.save();

  return {
    employeeName: user.name,
    employeeId: user.employeeId,
    checkOutTime: now,
  };
};

// Get today's logs for check-in terminal
export const getTodayAttendance = async () => {
  const todayStr = getLocalDateString();
  return Attendance.find({ date: todayStr })
    .populate("userId", "name employeeId role workingShift")
    .sort({ updatedAt: -1 })
    .lean();
};

// Get shifts weekly grid
export const getShifts = async (startDate: string, endDate: string) => {
  if (!startDate || !endDate) {
    throw badRequest("Thiếu ngày bắt đầu hoặc ngày kết thúc");
  }
  return ShiftSchedule.find({
    date: { $gte: startDate, $lte: endDate },
  })
    .populate("userId", "name employeeId role")
    .lean();
};

// Assign/Update shift
export const assignShift = async (
  userId: string,
  date: string,
  shiftType: "morning" | "afternoon" | "night" | "full" | "off",
  managerId: string
) => {
  if (!userId || !date || !shiftType) {
    throw badRequest("Thiếu thông tin phân ca");
  }

  // Check if month is locked
  const dateMonth = date.substring(0, 7); // YYYY-MM
  const lockRecord = await PayrollPeriod.findOne({ month: dateMonth, isLocked: true }).lean();
  if (lockRecord) {
    throw badRequest("Không thể thay đổi ca làm việc của tháng đã khóa lương");
  }

  return ShiftSchedule.findOneAndUpdate(
    { userId: new mongoose.Types.ObjectId(userId), date },
    { 
      $set: { 
        shiftType, 
        assignedBy: new mongoose.Types.ObjectId(managerId) 
      } 
    },
    { upsert: true, new: true }
  );
};

// Get monthly attendance sheet
export const getMonthlyAttendance = async (month: string) => {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    throw badRequest("Tháng không hợp lệ (định dạng đúng: YYYY-MM)");
  }

  return Attendance.find({
    date: { $regex: new RegExp("^" + month) },
  })
    .populate("userId", "name employeeId role workingShift")
    .sort({ date: 1 })
    .lean();
};

// Get monthly payroll summary
export const getMonthlyPayroll = async (month: string) => {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    throw badRequest("Tháng không hợp lệ (định dạng đúng: YYYY-MM)");
  }

  // 1. Check if month is locked
  const lockRecord = await PayrollPeriod.findOne({ month })
    .populate("lockedBy", "name")
    .lean();

  if (lockRecord && lockRecord.isLocked) {
    return {
      payrolls: lockRecord.payrolls,
      isLocked: true,
      lockedAt: lockRecord.lockedAt,
      lockedBy: (lockRecord.lockedBy as any)?.name || "System",
    };
  }

  // Find all active staffs/managers
  const staffList = await User.find({
    role: { $in: ["manager", "staff"] },
    isDeleted: { $ne: true },
  }).lean();

  const startOfMonth = new Date(month + "-01T00:00:00.000Z");
  const parts = month.split("-");
  const year = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const endOfMonth = new Date(year, m, 1); // 1st of next month

  const payrolls = [];

  for (const staff of staffList) {
    // 1. Calculate attendance stats
    const logs = await Attendance.find({
      userId: staff._id,
      date: { $regex: new RegExp("^" + month) },
    }).lean();

    let presentDays = 0;
    let lateDays = 0;
    let halfDays = 0;
    let absentDays = 0;
    let incompleteDays = 0;

    for (const log of logs) {
      if (log.status === "present" || log.status === "late") {
        if (!log.checkOut) {
          incompleteDays++;
        } else {
          presentDays++;
          if (log.status === "late") lateDays++;
        }
      } else if (log.status === "half_day") {
        if (!log.checkOut) {
          incompleteDays++;
        } else {
          halfDays++;
        }
      } else if (log.status === "absent") {
        absentDays++;
      }
    }

    const actualWorkingDays = presentDays + halfDays * 0.5;
    
    // Monthly standard work days is 26
    const baseSalary = staff.salaryInfo?.baseSalary || 0;
    const allowance = staff.salaryInfo?.allowance || 0;
    const commissionRate = staff.salaryInfo?.commissionRate || 0;

    const baseSalaryEarned = Math.round((baseSalary / 26) * actualWorkingDays);

    // 2. Calculate POS commission
    const orders = await Order.find({
      creatorId: staff._id,
      channel: "pos",
      paymentStatus: "paid",
      orderStatus: { $nin: ["cancelled", "returned"] },
      createdAt: { $gte: startOfMonth, $lt: endOfMonth },
    }).lean();

    const totalPOSSales = orders.reduce((sum, o) => sum + o.totalAmount, 0);
    const commissionEarned = Math.round(totalPOSSales * (commissionRate / 100));

    // 3. Late penalty: 50,000 VND per late check-in
    const latePenalty = lateDays * 50000;

    const netSalary = baseSalaryEarned + allowance + commissionEarned - latePenalty;

    payrolls.push({
      userId: staff._id,
      employeeId: staff.employeeId || "N/A",
      name: staff.name,
      role: staff.role,
      baseSalary,
      allowance,
      commissionRate,
      presentDays,
      lateDays,
      halfDays,
      absentDays,
      incompleteDays,
      actualWorkingDays,
      totalPOSSales,
      baseSalaryEarned,
      commissionEarned,
      latePenalty,
      netSalary: Math.max(0, netSalary),
    });
  }

  return {
    payrolls,
    isLocked: false,
  };
};

// Lock payroll for a month
export const lockPayroll = async (month: string, managerId: string) => {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    throw badRequest("Tháng không hợp lệ (định dạng đúng: YYYY-MM)");
  }

  const existingLock = await PayrollPeriod.findOne({ month });
  if (existingLock && existingLock.isLocked) {
    throw badRequest(`Tháng ${month} đã chốt lương rồi, không thể chốt lại`);
  }

  // Calculate dynamic payroll snapshot
  const result = await getMonthlyPayroll(month);

  return PayrollPeriod.findOneAndUpdate(
    { month },
    {
      $set: {
        isLocked: true,
        lockedAt: new Date(),
        lockedBy: new mongoose.Types.ObjectId(managerId),
        payrolls: result.payrolls,
      }
    },
    { upsert: true, new: true }
  );
};

// Copy shifts from one week to another
export const copyShifts = async (
  sourceStart: string,
  sourceEnd: string,
  targetStart: string,
  managerId: string
) => {
  if (!sourceStart || !sourceEnd || !targetStart) {
    throw badRequest("Thiếu ngày nguồn hoặc ngày đích để sao chép lịch trực");
  }

  // Check if target week overlaps with a locked month
  const targetStartDate = new Date(targetStart);
  for (let i = 0; i < 7; i++) {
    const checkDate = new Date(targetStartDate);
    checkDate.setDate(checkDate.getDate() + i);
    const dateStr = getLocalDateString(checkDate);
    const monthStr = dateStr.substring(0, 7);
    const isLocked = await PayrollPeriod.findOne({ month: monthStr, isLocked: true }).lean();
    if (isLocked) {
      throw badRequest("Không thể sao chép lịch trực vì tuần đích chứa ngày thuộc tháng đã chốt lương");
    }
  }

  // Fetch all schedules in the source week
  const sourceShifts = await ShiftSchedule.find({
    date: { $gte: sourceStart, $lte: sourceEnd }
  }).lean();

  const sourceStartDate = new Date(sourceStart);
  const diffTime = targetStartDate.getTime() - sourceStartDate.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  for (const shift of sourceShifts) {
    const sDate = new Date(shift.date);
    sDate.setDate(sDate.getDate() + diffDays);
    const targetDateStr = getLocalDateString(sDate);

    await ShiftSchedule.findOneAndUpdate(
      { userId: shift.userId, date: targetDateStr },
      {
        $set: {
          shiftType: shift.shiftType,
          assignedBy: new mongoose.Types.ObjectId(managerId)
        }
      },
      { upsert: true, new: true }
    );
  }

  return { success: true, copiedCount: sourceShifts.length };
};
