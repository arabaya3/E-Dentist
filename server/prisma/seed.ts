import {
  Currency,
  Gender,
  PrismaClient,
  ReportGenerationStatus,
  ReportType,
  ServiceType,
  VoiceAgentsProvider,
} from "@prisma/client";

const prisma = new PrismaClient();

function daysFromNow(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function randomTimeBetween9and6(): string {
  const hour = 9 + Math.floor(Math.random() * 9); // 9-17 (5 PM)
  const minute = Math.random() < 0.5 ? 0 : 30; // :00 or :30
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
}

function randomDateInNext30Days(): string {
  const days = Math.floor(Math.random() * 30);
  const date = daysFromNow(days);
  return date.toISOString().split("T")[0];
}

async function clearDatabase() {
  await prisma.clinicPermission.deleteMany();
  await prisma.agentPageConfig.deleteMany();
  await prisma.agentClinicAssignment.deleteMany();
  await prisma.voiceCall.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.reportReview.deleteMany();
  await prisma.report.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.voucher.deleteMany();
  await prisma.countryPricing.deleteMany();
  await prisma.contactUs.deleteMany();
  await prisma.waitingList.deleteMany();
  await prisma.user.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.clinic.deleteMany();
}

async function seed() {
  await clearDatabase();

  // ============================================
  // 1. CLINICS - Realistic Jordanian Clinics
  // ============================================
  const clinics = await Promise.all(
    [
      {
        name: "Amman Dental Care – Abdoun",
        affiliateClinicAccessEnabled: true,
        photo: "https://placehold.co/200x200?text=Amman+Dental",
      },
      {
        name: "Smile Line Clinic – Khalda",
        affiliateClinicAccessEnabled: true,
        photo: "https://placehold.co/200x200?text=Smile+Line",
      },
      {
        name: "Downtown Oral Center – Jabal Amman",
        affiliateClinicAccessEnabled: false,
        photo: "https://placehold.co/200x200?text=Downtown+Oral",
      },
      {
        name: "Royal Dental Center – Sweifieh",
        affiliateClinicAccessEnabled: true,
        photo: "https://placehold.co/200x200?text=Royal+Dental",
      },
      {
        name: "Bright Smile Clinic – Shmeisani",
        affiliateClinicAccessEnabled: false,
        photo: "https://placehold.co/200x200?text=Bright+Smile",
      },
    ].map((data) => prisma.clinic.create({ data }))
  );

  // ============================================
  // 2. PERMISSIONS
  // ============================================
  const permissions = await Promise.all(
    [
      "appointments:read",
      "appointments:write",
      "billing:read",
      "analytics:view",
      "voice:manage",
    ].map((name) => prisma.permission.create({ data: { name } }))
  );

  await Promise.all(
    clinics.map((clinic, index) =>
      prisma.clinicPermission.create({
        data: {
          clinicId: clinic.id,
          permissionId: permissions[index % permissions.length].id,
        },
      })
    )
  );

  // ============================================
  // 3. DOCTORS (as Users with clinicId)
  // ============================================
  const doctors = await Promise.all(
    [
      {
        name: "Dr. Ahmad Al-Rousan",
        email: "ahmad.alousan@dental.jo",
        mobileNumber: "0798123456",
        clinicId: clinics[0].id,
        language: "ar",
        profileComplete: true,
        isClinicAdmin: false,
      },
      {
        name: "Dr. Rawan Shaker",
        email: "rawan.shaker@dental.jo",
        mobileNumber: "0787654321",
        clinicId: clinics[0].id,
        language: "ar",
        profileComplete: true,
        isClinicAdmin: false,
      },
      {
        name: "Dr. Omar Al-Haddad",
        email: "omar.haddad@dental.jo",
        mobileNumber: "0771234567",
        clinicId: clinics[1].id,
        language: "ar",
        profileComplete: true,
        isClinicAdmin: false,
      },
      {
        name: "Dr. Lina Al-Khatib",
        email: "lina.khatib@dental.jo",
        mobileNumber: "0799876543",
        clinicId: clinics[1].id,
        language: "ar",
        profileComplete: true,
        isClinicAdmin: false,
      },
      {
        name: "Dr. Yazan Jaber",
        email: "yazan.jaber@dental.jo",
        mobileNumber: "0782345678",
        clinicId: clinics[2].id,
        language: "ar",
        profileComplete: true,
        isClinicAdmin: false,
      },
    ].map((data) => prisma.user.create({ data }))
  );

  // ============================================
  // 4. PATIENTS (Users without clinicId)
  // ============================================
  const patients = await Promise.all(
    [
      {
        name: "Omar Al-Haddad",
        email: "omar.haddad.patient@gmail.com",
        mobileNumber: "0791112233",
        clinicId: null,
        language: "ar",
        profileComplete: true,
      },
      {
        name: "Rana Al-Khatib",
        email: "rana.khatib@hotmail.com",
        mobileNumber: "0782223344",
        clinicId: null,
        language: "ar",
        profileComplete: true,
      },
      {
        name: "Yazan Jaber",
        email: "yazan.jaber.patient@gmail.com",
        mobileNumber: "0773334455",
        clinicId: null,
        language: "ar",
        profileComplete: true,
      },
      {
        name: "Sara Al-Masri",
        email: "sara.masri@yahoo.com",
        mobileNumber: "0794445566",
        clinicId: null,
        language: "ar",
        profileComplete: true,
      },
      {
        name: "Khalid Al-Zoubi",
        email: "khalid.zoubi@gmail.com",
        mobileNumber: "0785556677",
        clinicId: null,
        language: "ar",
        profileComplete: true,
      },
    ].map((data) => prisma.user.create({ data }))
  );

  // ============================================
  // 5. APPOINTMENTS - Realistic Jordanian Data
  // ============================================
  const services = ["Cleaning", "Whitening", "Composite Filling"];
  const statuses = ["confirmed", "pending"];

  const appointments = await Promise.all(
    [
      {
        appointment_raw_details: {
          doctorName: "Dr. Ahmad Al-Rousan",
          clinicBranch: "Amman Dental Care – Abdoun",
          patientName: "Omar Al-Haddad",
          patientPhone: "0791112233",
          serviceType: "Cleaning",
          appointmentDate: randomDateInNext30Days(),
          appointmentTime: randomTimeBetween9and6(),
          status: "confirmed",
          notes: "Regular cleaning appointment",
        },
      },
      {
        appointment_raw_details: {
          doctorName: "Dr. Rawan Shaker",
          clinicBranch: "Amman Dental Care – Abdoun",
          patientName: "Rana Al-Khatib",
          patientPhone: "0782223344",
          serviceType: "Whitening",
          appointmentDate: randomDateInNext30Days(),
          appointmentTime: randomTimeBetween9and6(),
          status: "confirmed",
          notes: "Teeth whitening session",
        },
      },
      {
        appointment_raw_details: {
          doctorName: "Dr. Omar Al-Haddad",
          clinicBranch: "Smile Line Clinic – Khalda",
          patientName: "Yazan Jaber",
          patientPhone: "0773334455",
          serviceType: "Composite Filling",
          appointmentDate: randomDateInNext30Days(),
          appointmentTime: randomTimeBetween9and6(),
          status: "pending",
          notes: "Filling for tooth #15",
        },
      },
      {
        appointment_raw_details: {
          doctorName: "Dr. Lina Al-Khatib",
          clinicBranch: "Smile Line Clinic – Khalda",
          patientName: "Sara Al-Masri",
          patientPhone: "0794445566",
          serviceType: "Cleaning",
          appointmentDate: randomDateInNext30Days(),
          appointmentTime: randomTimeBetween9and6(),
          status: "confirmed",
          notes: "Deep cleaning required",
        },
      },
      {
        appointment_raw_details: {
          doctorName: "Dr. Yazan Jaber",
          clinicBranch: "Downtown Oral Center – Jabal Amman",
          patientName: "Khalid Al-Zoubi",
          patientPhone: "0785556677",
          serviceType: "Whitening",
          appointmentDate: randomDateInNext30Days(),
          appointmentTime: randomTimeBetween9and6(),
          status: "confirmed",
          notes: "First whitening session",
        },
      },
    ].map((data) => prisma.appointment.create({ data }))
  );

  // ============================================
  // 6. VOUCHERS - Realistic Marketing Codes
  // ============================================
  const vouchers = await Promise.all(
    [
      {
        code: "JORDAN-SMILE-10",
        discountPercentage: 10,
        expirationDate: daysFromNow(60),
        seats: 50,
        clinicId: clinics[0].id,
        isActive: true,
      },
      {
        code: "WHITENING-20",
        discountPercentage: 20,
        expirationDate: daysFromNow(45),
        seats: 30,
        clinicId: clinics[1].id,
        isActive: true,
      },
      {
        code: "CLEANING-15",
        discountPercentage: 15,
        expirationDate: daysFromNow(90),
        seats: 100,
        clinicId: clinics[2].id,
        isActive: true,
      },
      {
        code: "FILLING-25",
        discountPercentage: 25,
        expirationDate: daysFromNow(30),
        seats: 20,
        clinicId: clinics[3].id,
        isActive: true,
      },
      {
        code: "NEW-PATIENT-30",
        discountPercentage: 30,
        expirationDate: daysFromNow(120),
        seats: 200,
        clinicId: clinics[4].id,
        isActive: true,
      },
    ].map((data) => prisma.voucher.create({ data }))
  );

  // ============================================
  // 7. TRANSACTIONS - Realistic JOD Pricing
  // ============================================
  // Cleaning: 25 JOD, Whitening: 60 JOD, Composite Filling: 40-50 JOD
  const transactions = await Promise.all(
    [
      {
        serviceType: ServiceType.REPORT,
        userId: patients[0].id,
        chargeId: `ch_${Date.now()}_1`,
        result: {
          status: "captured",
          amount: 25, // Cleaning
          currency: "JOD",
        },
        voucherId: vouchers[0].id,
      },
      {
        serviceType: ServiceType.REPORT,
        userId: patients[1].id,
        chargeId: `ch_${Date.now()}_2`,
        result: {
          status: "captured",
          amount: 60, // Whitening
          currency: "JOD",
        },
        voucherId: vouchers[1].id,
      },
      {
        serviceType: ServiceType.REPORT,
        userId: patients[2].id,
        chargeId: `ch_${Date.now()}_3`,
        result: {
          status: "captured",
          amount: 45, // Composite Filling
          currency: "JOD",
        },
        voucherId: vouchers[2].id,
      },
      {
        serviceType: ServiceType.REPORT,
        userId: patients[3].id,
        chargeId: `ch_${Date.now()}_4`,
        result: {
          status: "captured",
          amount: 25, // Cleaning
          currency: "JOD",
        },
        voucherId: null,
      },
      {
        serviceType: ServiceType.REPORT,
        userId: patients[4].id,
        chargeId: `ch_${Date.now()}_5`,
        result: {
          status: "captured",
          amount: 50, // Composite Filling
          currency: "JOD",
        },
        voucherId: vouchers[4].id,
      },
    ].map((data) => prisma.transaction.create({ data }))
  );

  // ============================================
  // 8. REPORTS - Realistic Dental Issues
  // ============================================
  const reports = await Promise.all(
    [
      {
        userId: patients[0].id,
        transactionId: transactions[0].id,
        status: ReportGenerationStatus.SUCCESS,
        type: ReportType.PAID,
        result: {
          summary:
            "Patient shows moderate calculus deposits on lower anterior teeth. Recommended deep cleaning session.",
          findings: ["calculus deposits", "mild gingivitis"],
        },
        analyzed_issues: [
          { tooth: 31, issue: "calculus deposits" },
          { tooth: 32, issue: "calculus deposits" },
          { tooth: 41, issue: "mild gingivitis" },
        ],
      },
      {
        userId: patients[1].id,
        transactionId: transactions[1].id,
        status: ReportGenerationStatus.SUCCESS,
        type: ReportType.PAID,
        result: {
          summary:
            "Teeth discoloration detected. Patient is a good candidate for whitening treatment.",
          findings: ["discoloration", "staining"],
        },
        analyzed_issues: [
          { tooth: 11, issue: "discoloration" },
          { tooth: 12, issue: "staining" },
          { tooth: 21, issue: "discoloration" },
        ],
      },
      {
        userId: patients[2].id,
        transactionId: transactions[2].id,
        status: ReportGenerationStatus.SUCCESS,
        type: ReportType.PAID,
        result: {
          summary:
            "Caries detected on tooth #15. Requires composite filling. No other issues found.",
          findings: ["caries"],
        },
        analyzed_issues: [{ tooth: 15, issue: "caries" }],
      },
      {
        userId: patients[3].id,
        transactionId: transactions[3].id,
        status: ReportGenerationStatus.IN_PROGRESS,
        type: ReportType.PAID,
        result: {
          summary: "Report generation in progress...",
        },
        analyzed_issues: [],
      },
      {
        userId: patients[4].id,
        transactionId: transactions[4].id,
        status: ReportGenerationStatus.SUCCESS,
        type: ReportType.PAID,
        result: {
          summary:
            "Multiple issues detected: enamel wear on molars and minor caries on premolars.",
          findings: ["enamel wear", "caries"],
        },
        analyzed_issues: [
          { tooth: 16, issue: "enamel wear" },
          { tooth: 17, issue: "enamel wear" },
          { tooth: 24, issue: "caries" },
        ],
      },
    ].map((data) => prisma.report.create({ data }))
  );

  // ============================================
  // 9. REPORT REVIEWS
  // ============================================
  await Promise.all(
    reports.slice(0, 3).map((report, index) =>
      prisma.reportReview.create({
        data: {
          reportId: report.id,
          userId: patients[index].id,
          rating: 4 + (index % 2), // 4 or 5
          comment:
            index === 0
              ? "التقرير كان مفيد جداً، شكراً لكم"
              : index === 1
              ? "Very detailed report, helped me understand my dental condition"
              : "ممتاز، شرح واضح للمشاكل",
        },
      })
    )
  );

  // ============================================
  // 10. VOICE CALLS - Realistic Intents
  // ============================================
  await prisma.voiceCall.createMany({
    data: [
      {
        agentId: "voice-agent-1",
        conversationId: `conv-${Date.now()}-1`,
        status: "completed",
        collectedData: {
          intent: "BOOK_APPOINTMENT",
          confidence: 0.92,
          patientName: "Omar Al-Haddad",
          requestedService: "Cleaning",
        },
        provider: VoiceAgentsProvider.ELEVEN_LABS,
        clinicId: clinics[0].id,
      },
      {
        agentId: "voice-agent-2",
        conversationId: `conv-${Date.now()}-2`,
        status: "completed",
        collectedData: {
          intent: "ASK_PRICE",
          confidence: 0.88,
          service: "Whitening",
          question: "كم سعر تبييض الأسنان؟",
        },
        provider: VoiceAgentsProvider.ELEVEN_LABS,
        clinicId: clinics[1].id,
      },
      {
        agentId: "voice-agent-3",
        conversationId: `conv-${Date.now()}-3`,
        status: "in_progress",
        collectedData: {
          intent: "FOLLOW_UP",
          confidence: 0.85,
          appointmentId: appointments[2].id,
        },
        provider: VoiceAgentsProvider.ELEVEN_LABS,
        clinicId: clinics[2].id,
      },
      {
        agentId: "voice-agent-4",
        conversationId: `conv-${Date.now()}-4`,
        status: "completed",
        collectedData: {
          intent: "BOOK_APPOINTMENT",
          confidence: 0.95,
          patientName: "Sara Al-Masri",
          requestedService: "Cleaning",
          preferredDate: randomDateInNext30Days(),
        },
        provider: VoiceAgentsProvider.ELEVEN_LABS,
        clinicId: clinics[3].id,
      },
      {
        agentId: "voice-agent-5",
        conversationId: `conv-${Date.now()}-5`,
        status: "completed",
        collectedData: {
          intent: "ASK_PRICE",
          confidence: 0.90,
          service: "Composite Filling",
          question: "What is the price for composite filling?",
        },
        provider: VoiceAgentsProvider.ELEVEN_LABS,
        clinicId: clinics[4].id,
      },
    ],
  });

  // ============================================
  // 11. AGENT CLINIC ASSIGNMENTS
  // ============================================
  await Promise.all(
    clinics.map((clinic, index) =>
      prisma.agentClinicAssignment.create({
        data: {
          agentId: `voice-agent-${index + 1}`,
          clinicId: clinic.id,
          isActive: true,
        },
      })
    )
  );

  // ============================================
  // 12. AGENT PAGE CONFIGS - Jordanian Names
  // ============================================
  await Promise.all(
    [
      {
        agentId: "config-agent-1",
        welcomeMessage:
          "مرحباً بك في عيادة Amman Dental Care. أنا مساعدك الذكي للحجوزات والاستفسارات.",
        initialGreetingMessage:
          "مرحباً! أنا eDentist.AI، مساعد الحجوزات الذكي لعيادة Amman Dental Care. كيف يمكنني مساعدتك اليوم؟",
        agentAvatar: "https://placehold.co/128x128?text=Agent+1",
        agentName: "أحمد",
        clinicId: clinics[0].id,
        provider: VoiceAgentsProvider.ELEVEN_LABS,
        gender: Gender.Male,
        color: "#4f46e5",
        requiredInfo: {
          fields: ["name", "phone", "service"],
        },
        isActive: true,
      },
      {
        agentId: "config-agent-2",
        welcomeMessage:
          "أهلاً وسهلاً في عيادة Smile Line Clinic. نحن هنا لخدمتك.",
        initialGreetingMessage:
          "مرحباً! أنا eDentist.AI من عيادة Smile Line Clinic. أستطيع مساعدتك في حجز موعد أو الإجابة على استفساراتك.",
        agentAvatar: "https://placehold.co/128x128?text=Agent+2",
        agentName: "رنا",
        clinicId: clinics[1].id,
        provider: VoiceAgentsProvider.ELEVEN_LABS,
        gender: Gender.Female,
        color: "#10b981",
        requiredInfo: {
          fields: ["name", "phone", "service"],
        },
        isActive: true,
      },
      {
        agentId: "config-agent-3",
        welcomeMessage:
          "Welcome to Downtown Oral Center. We're here to help with your dental needs.",
        initialGreetingMessage:
          "Hello! I'm eDentist.AI from Downtown Oral Center. How can I assist you today?",
        agentAvatar: "https://placehold.co/128x128?text=Agent+3",
        agentName: "Omar",
        clinicId: clinics[2].id,
        provider: VoiceAgentsProvider.ELEVEN_LABS,
        gender: Gender.Male,
        color: "#f59e0b",
        requiredInfo: {
          fields: ["name", "phone", "service"],
        },
        isActive: true,
      },
      {
        agentId: "config-agent-4",
        welcomeMessage:
          "مرحباً بك في Royal Dental Center. نسعى لتقديم أفضل خدمة لصحة أسنانك.",
        initialGreetingMessage:
          "أهلاً وسهلاً! أنا eDentist.AI من عيادة Royal Dental Center. كيف يمكنني مساعدتك؟",
        agentAvatar: "https://placehold.co/128x128?text=Agent+4",
        agentName: "ليلى",
        clinicId: clinics[3].id,
        provider: VoiceAgentsProvider.ELEVEN_LABS,
        gender: Gender.Female,
        color: "#8b5cf6",
        requiredInfo: {
          fields: ["name", "phone", "service"],
        },
        isActive: true,
      },
      {
        agentId: "config-agent-5",
        welcomeMessage:
          "Welcome to Bright Smile Clinic. Your smile is our priority.",
        initialGreetingMessage:
          "Hello! I'm eDentist.AI from Bright Smile Clinic. I can help you book appointments or answer questions.",
        agentAvatar: "https://placehold.co/128x128?text=Agent+5",
        agentName: "Yazan",
        clinicId: clinics[4].id,
        provider: VoiceAgentsProvider.ELEVEN_LABS,
        gender: Gender.Male,
        color: "#ef4444",
        requiredInfo: {
          fields: ["name", "phone", "service"],
        },
        isActive: true,
      },
    ].map((data) => prisma.agentPageConfig.create({ data }))
  );

  // ============================================
  // 13. WAITING LIST
  // ============================================
  await prisma.waitingList.createMany({
    data: [
      { email: "waiting1@example.com" },
      { email: "waiting2@example.com" },
      { email: "waiting3@example.com" },
      { email: "waiting4@example.com" },
      { email: "waiting5@example.com" },
    ],
  });

  // ============================================
  // 14. COUNTRY PRICING
  // ============================================
  await prisma.countryPricing.createMany({
    data: [
      { country: "Jordan", currency: Currency.USD, pricing: 99 },
      { country: "UAE", currency: Currency.AED, pricing: 350 },
      { country: "Saudi Arabia", currency: Currency.SAR, pricing: 360 },
      { country: "Qatar", currency: Currency.QAR, pricing: 330 },
      { country: "Kuwait", currency: Currency.KWD, pricing: 30 },
    ],
  });

  // ============================================
  // 15. CONTACT US
  // ============================================
  await prisma.contactUs.createMany({
    data: [
      {
        firstName: "محمد",
        lastName: "الزعبي",
        email: "mohammad.zoubi@example.com",
        phoneNumber: "0791234567",
        position: "Clinic Manager",
        subject: "استفسار عن الخدمات",
        message: "أريد معرفة المزيد عن خدمات العيادة وأسعارها.",
      },
      {
        firstName: "Layla",
        lastName: "Al-Masri",
        email: "layla.masri@example.com",
        phoneNumber: "0787654321",
        position: "Patient",
        subject: "Inquiry about appointments",
        message: "I would like to know more about booking appointments.",
      },
      {
        firstName: "خالد",
        lastName: "الخطيب",
        email: "khalid.khatib@example.com",
        phoneNumber: "0771112233",
        position: "Dental Student",
        subject: "استفسار أكاديمي",
        message: "أريد معلومات عن برامج التدريب المتاحة.",
      },
      {
        firstName: "Nour",
        lastName: "Jaber",
        email: "nour.jaber@example.com",
        phoneNumber: "0799876543",
        position: "Marketing Manager",
        subject: "Partnership inquiry",
        message: "We are interested in partnering with your clinic.",
      },
      {
        firstName: "أحمد",
        lastName: "الروسان",
        email: "ahmad.alousan@example.com",
        phoneNumber: "0782345678",
        position: "Patient",
        subject: "شكوى",
        message: "لدي ملاحظة حول موعد سابق.",
      },
    ],
  });

  console.log("✅ Database seeded with realistic Jordanian dental clinic data.");
  console.log(`   - ${clinics.length} clinics created`);
  console.log(`   - ${doctors.length} doctors created`);
  console.log(`   - ${patients.length} patients created`);
  console.log(`   - ${appointments.length} appointments created`);
  console.log(`   - ${vouchers.length} vouchers created`);
  console.log(`   - ${transactions.length} transactions created`);
  console.log(`   - ${reports.length} reports created`);
}

seed()
  .catch((error) => {
    console.error("❌ Failed to seed database:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
