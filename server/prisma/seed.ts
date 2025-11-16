import { PrismaClient, ReportGenerationStatus, ReportType, ServiceType, VoiceAgentsProvider, Gender } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // تنظيف الجداول قبل إدخال بيانات جديدة
  await prisma.$transaction([
    prisma.reportReview.deleteMany(),
    prisma.report.deleteMany(),
    prisma.transaction.deleteMany(),
    prisma.voucher.deleteMany(),
    prisma.voiceCall.deleteMany(),
    prisma.agentPageConfig.deleteMany(),
    prisma.agentClinicAssignment.deleteMany(),
    prisma.clinicPermission.deleteMany(),
    prisma.permission.deleteMany(),
    prisma.countryPricing.deleteMany(),
    prisma.contactUs.deleteMany(),
    prisma.appointment.deleteMany(),
    prisma.waitingList.deleteMany(),
    prisma.user.deleteMany(),
    prisma.clinic.deleteMany(),
  ]);

  // 1. بيانات عامة
  await prisma.waitingList.createMany({
    data: [
      { email: 'lead1@example.com' },
      { email: 'lead2@example.com' },
    ],
    skipDuplicates: true,
  });

  // 2. العيادة والصلاحيات
  const clinic = await prisma.clinic.create({
    data: {
      name: 'Downtown Dental Center',
      affiliateClinicAccessEnabled: true,
      photo: 'https://cdn.example.com/clinic/downtown.jpg',
    },
  });

  await prisma.permission.createMany({
    data: [{ name: 'MANAGE_REPORTS' }, { name: 'MANAGE_BOOKINGS' }],
    skipDuplicates: true,
  });

  const permissions = await prisma.permission.findMany({
    where: { name: { in: ['MANAGE_REPORTS', 'MANAGE_BOOKINGS'] } },
  });

  await prisma.clinicPermission.createMany({
    data: permissions.map((permission) => ({
      clinicId: clinic.id,
      permissionId: permission.id,
    })),
    skipDuplicates: true,
  });

  // 3. المستخدمون
  const adminUser = await prisma.user.create({
    data: {
      name: 'Dr. Sara Hussein',
      email: 'admin@edentist.ai',
      mobileNumber: '+966500000001',
      profileComplete: true,
      language: 'ar',
      clinicId: clinic.id,
      isSuperAdmin: true,
      photo: 'https://cdn.example.com/users/sara.jpg',
    },
  });

  const patientUser = await prisma.user.create({
    data: {
      name: 'Mohammed Al-Omari',
      email: 'patient@example.com',
      mobileNumber: '+966511223344',
      profileComplete: true,
      language: 'ar',
      clinicId: clinic.id,
    },
  });

  // 4. القسائم والمعاملات
  const voucher = await prisma.voucher.create({
    data: {
      code: 'WELCOME10',
      discountPercentage: 10,
      expirationDate: new Date('2026-01-01'),
      seats: 100,
      clinicId: clinic.id,
    },
  });

  const transaction = await prisma.transaction.create({
    data: {
      userId: patientUser.id,
      serviceType: ServiceType.REPORT,
      chargeId: 'ch_01ABCDEF1234567890',
      result: { status: 'captured', amount: 249 },
      voucherId: voucher.id,
    },
  });

  // 5. التقارير والمراجعات
  const report = await prisma.report.create({
    data: {
      userId: patientUser.id,
      transactionId: transaction.id,
      type: ReportType.FREE,
      status: ReportGenerationStatus.SUCCESS,
      result: { summary: 'Oral hygiene is good. Mild crowding detected.' },
      analyzed_issues: [{ tooth: 13, issue: 'Crowding' }],
      anterior_teeth_raw: 'raw/anterior.jpg',
      upper_teeth_raw: 'raw/upper.jpg',
      lower_teeth_raw: 'raw/lower.jpg',
      anterior_teeth_labeled: 'label/anterior.png',
      upper_teeth_labeled: 'label/upper.png',
      lower_teeth_labeled: 'label/lower.png',
    },
  });

  await prisma.reportReview.create({
    data: {
      reportId: report.id,
      userId: patientUser.id,
      rating: 5,
      comment: 'Very informative and helpful!',
    },
  });

  // 6. اتصالات العملاء
  await prisma.contactUs.create({
    data: {
      firstName: 'Laila',
      lastName: 'Al-Otaibi',
      email: 'laila@example.com',
      phoneNumber: '+971501112233',
      position: 'Clinic Manager',
      subject: 'Request for demo',
      message: 'We would like to try the AI receptionist for our second branch.',
    },
  });

  await prisma.countryPricing.createMany({
    data: [
      { country: 'Saudi Arabia', currency: 'SAR', pricing: 449 },
      { country: 'United Arab Emirates', currency: 'AED', pricing: 449 },
      { country: 'United States', currency: 'USD', pricing: 119 },
    ],
    skipDuplicates: true,
  });

  // 7. بيانات العيادة (وكيل + صلاحيات)
  await prisma.agentClinicAssignment.create({
    data: {
      agentId: 'agent-edentist-001',
      clinicId: clinic.id,
      isActive: true,
    },
  });

  await prisma.agentPageConfig.create({
    data: {
      agentId: 'agent-edentist-001',
      clinicId: clinic.id,
      agentName: 'Maya',
      agentAvatar: 'https://cdn.example.com/agents/maya.png',
      provider: VoiceAgentsProvider.ELEVEN_LABS,
      gender: Gender.Female,
      welcomeMessage: 'مرحبا! أنا مايا من eDentist.AI.',
      initialGreetingMessage: 'Hello and welcome to Downtown Dental! How can I assist you today?',
      color: '#2F80ED',
      requiredInfo: { fields: ['name', 'phone', 'service'] },
    },
  });

  await prisma.clinicContent.createMany({
    data: [
      {
        slug: 'booking.confirmed',
        locale: 'ar',
        content:
          'تم حجز موعدك مع الدكتور {{doctor_name}} في فرع {{clinic_branch}} بتاريخ {{appointment_date}} الساعة {{appointment_time}}.',
        tags: ['booking'],
      },
      {
        slug: 'booking.confirmed',
        locale: 'en',
        content:
          'Your appointment with Dr. {{doctor_name}} at {{clinic_branch}} is booked for {{appointment_date}} at {{appointment_time}}.',
        tags: ['booking'],
      },
      {
        slug: 'booking.rescheduled',
        locale: 'ar',
        content:
          'تم تعديل موعدك إلى يوم {{appointment_date}} الساعة {{appointment_time}}.',
        tags: ['booking'],
      },
      {
        slug: 'booking.rescheduled',
        locale: 'en',
        content:
          'Your appointment has been moved to {{appointment_date}} at {{appointment_time}}.',
        tags: ['booking'],
      },
      {
        slug: 'booking.missing_fields',
        locale: 'ar',
        content: 'لا يزال ينقصني: {{missing_fields}} لإكمال الحجز.',
        tags: ['booking'],
      },
      {
        slug: 'booking.missing_fields',
        locale: 'en',
        content: 'I still need: {{missing_fields}} to finish the booking.',
        tags: ['booking'],
      },
      {
        slug: 'booking.cancelled',
        locale: 'ar',
        content:
          'تم إلغاء موعدك بنجاح، يسعدنا خدمتك في أي وقت آخر.',
        tags: ['booking'],
      },
      {
        slug: 'booking.cancelled',
        locale: 'en',
        content:
          'Your appointment has been cancelled successfully. We hope to see you soon!',
        tags: ['booking'],
      },
      {
        slug: 'inquiry.general',
        locale: 'ar',
        content:
          'أستطيع مساعدتك في خدمات التنظيف، التقويم، الزراعة والتبييض. كيف أحب أن أساعدك؟',
        tags: ['inquiry'],
      },
      {
        slug: 'inquiry.general',
        locale: 'en',
        content:
          'I can help with cleaning, orthodontics, implants, or whitening questions. How can I assist you today?',
        tags: ['inquiry'],
      },
      {
        slug: 'follow_up.general',
        locale: 'ar',
        content:
          'كيف كان شعورك بعد زيارتك الأخيرة؟ هل ترغب في تحديد زيارة متابعة؟',
        tags: ['follow_up'],
      },
      {
        slug: 'follow_up.general',
        locale: 'en',
        content:
          'How have you been feeling after your recent visit? Would you like to schedule a follow-up?',
        tags: ['follow_up'],
      },
    ],
    skipDuplicates: true,
  });

  await prisma.voiceCall.create({
    data: {
      agentId: 'agent-edentist-001',
      conversationId: 'conv_2025_0001',
      status: 'completed',
      collectedData: {
        name: 'Yousef',
        service: 'Cleaning',
        preferredTime: '2025-02-12T11:00:00Z',
      },
      provider: VoiceAgentsProvider.ELEVEN_LABS,
      clinicId: clinic.id,
    },
  });

  // 8. مواعيد جديدة (جدول Appointment الجديد)
  await prisma.appointment.create({
    data: {
      appointment_raw_details: {
        name: 'Reem',
        mobile: '+966555667788',
        doctorPreference: 'Dr. Lina Samir',
        notes: 'Prefers afternoon slots',
      },
    },
  });

  console.log('Seed data inserted successfully.');
}

main()
  .catch((error) => {
    console.error('Seeding error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
