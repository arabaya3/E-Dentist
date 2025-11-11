'use strict';

const { randomUUID } = require('crypto');
const {
  persistEncryptedJSON,
  sanitizeSensitiveText,
  sanitizeObject,
} = require('./security.ts');

const SENTIMENT_LABELS = ['satisfied', 'concerned', 'angry'];

const sentimentLexicon = {
  satisfied: [
    'thank you',
    'thanks',
    'great',
    'perfect',
    'awesome',
    'excellent',
    'resolved',
    'grateful',
    'appreciate',
    'happy',
    'relieved',
    'ممتاز',
    'رائع',
    'شكرا',
    'شكراً',
    'شكري',
    'تم الحل',
    'مرتاح',
  ],
  concerned: [
    'worried',
    'concerned',
    'delay',
    'late',
    'waiting',
    'unsure',
    'follow up',
    'status',
    'confirm',
    'need update',
    'question',
    'استفسار',
    'قلق',
    'متوتر',
    'متأخر',
    'تأخير',
    'أحتاج',
    'أريد تأكيد',
    'هل تم',
    'متى',
  ],
  angry: [
    'angry',
    'mad',
    'upset',
    'furious',
    'complain',
    'disappointed',
    'unacceptable',
    'bad service',
    'terrible',
    'annoyed',
    'غاضب',
    'غضبان',
    'سيء',
    'سئ',
    'غير راض',
    'غير راضية',
    'مزعل',
    'أسوأ',
    'إلغاء',
    'اريد الغاء',
  ],
};

const serviceKeywords = [
  'cleaning',
  'whitening',
  'filling',
  'implant',
  'root canal',
  'check-up',
  'checkup',
  'crown',
  'braces',
  'aligner',
  'تقويم',
  'تنظيف',
  'حشوة',
  'حشوه',
  'تبييض',
  'زرع',
  'زرعة',
  'خلع',
];

const successCues = [
  'appointment confirmed',
  'appointment is confirmed',
  'booking confirmed',
  'scheduled',
  'scheduled successfully',
  'your visit is set',
  'see you',
  'تم تأكيد الموعد',
  'تم حجز الموعد',
  'تم الحجز',
  'اكدت لك الموعد',
  'تم الالغاء بنجاح',
  'تم الإلغاء بنجاح',
];

const failureCues = [
  'unable to',
  'cannot',
  'can not',
  'sorry we could not',
  'failed',
  'unfortunately',
  'not available',
  'no slots',
  'تعذر',
  'لم أتمكن',
  'لا يوجد موعد',
  'غير متاح',
];

const dateKeywords = [
  'today',
  'tomorrow',
  'tonight',
  'morning',
  'evening',
  'next week',
  'next monday',
  'next tuesday',
  'next wednesday',
  'next thursday',
  'next friday',
  'next saturday',
  'next sunday',
  'السبت',
  'الأحد',
  'الاحد',
  'الاثنين',
  'الإثنين',
  'الثلاثاء',
  'الأربعاء',
  'الاربعاء',
  'الخميس',
  'الجمعة',
  'غداً',
  'غدا',
  'اليوم',
  'بكرة',
];

const SENTIMENT_SCORES = {
  satisfied: 1,
  concerned: -0.25,
  angry: -1,
  neutral: 0,
};

function normaliseText(text) {
  return text
    .normalize('NFKD')
    .replace(/[\u064B-\u0652]/g, '')
    .toLowerCase();
}

function tokenize(text) {
  return normaliseText(text)
    .replace(/[^a-z\u0621-\u063a\u0641-\u064a0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function sentimentScore(text) {
  const normalized = normaliseText(text);
  const tokens = tokenize(text);

  const scores = {
    satisfied: 0,
    concerned: 0,
    angry: 0,
  };

  SENTIMENT_LABELS.forEach((label) => {
    sentimentLexicon[label].forEach((kw) => {
      if (normalized.includes(kw)) {
        scores[label] += 1.5;
      } else {
        const kwTokens = kw.split(/\s+/);
        if (
          kwTokens.length === 1 &&
          tokens.some((token) => token === kwTokens[0])
        ) {
          scores[label] += 1;
        }
      }
    });
  });

  const maxLabel = Object.entries(scores).reduce(
    (acc, [label, value]) => {
      if (value > acc.value) {
        return { label, value };
      }
      return acc;
    },
    { label: 'concerned', value: 0 }
  );

  if (maxLabel.value === 0) {
    return {
      label: 'concerned',
      confidence: 0,
      scores,
      aggregateScore: SENTIMENT_SCORES.concerned,
    };
  }

  return {
    label: maxLabel.label,
    confidence: Math.min(1, maxLabel.value / 4),
    scores,
    aggregateScore: SENTIMENT_SCORES[maxLabel.label] ?? 0,
  };
}

function extractName(text) {
  const regexes = [
    /\bmy name is\s+([a-z\u0621-\u064a\s]{2,40})/i,
    /\bthis is\s+([a-z\u0621-\u064a\s]{2,40})/i,
    /\bI am\s+([a-z\u0621-\u064a\s]{2,40})/i,
    /\bأنا\s+([^\s,.،]{2,30})/i,
    /\bاسمي\s+([^\s,.،]{2,30})/i,
  ];

  for (const reg of regexes) {
    const match = text.match(reg);
    if (match) {
      return match[1].trim();
    }
  }
  return null;
}

function extractDate(text) {
  const datePattern =
    /\b(?:\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?|\d{1,2}\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*|\d{1,2}\s*(?:يناير|فبراير|مارس|أبريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر))\b/iu;
  const timePattern = /\b\d{1,2}[:.]\d{2}\s*(?:am|pm)?\b/i;

  const dateMatch = text.match(datePattern);
  const timeMatch = text.match(timePattern);

  if (dateMatch || timeMatch) {
    return [dateMatch?.[0], timeMatch?.[0]]
      .filter(Boolean)
      .join(' ')
      .trim();
  }

  if (dateKeywords.some((kw) => normaliseText(text).includes(kw))) {
    return dateKeywords.find((kw) =>
      normaliseText(text).includes(kw)
    );
  }

  return null;
}

function extractService(text) {
  const normalized = normaliseText(text);
  const matched = serviceKeywords.find((kw) => normalized.includes(kw));
  return matched || null;
}

function detectHallucination(text, session) {
  const normalized = normaliseText(text);
  const tokens = tokenize(text);

  let flags = 0;

  const mentionsName =
    /mr\.?|mrs\.?|dear|السيد|السيدة|أستاذ|استاذ/.test(normalized);
  if (mentionsName && !session.entities.customerName) {
    flags += 1;
  }

  const mentionsService = serviceKeywords.some((kw) =>
    normalized.includes(kw)
  );
  if (mentionsService && !session.entities.service) {
    flags += 1;
  }

  const mentionsDate =
    dateKeywords.some((kw) => normalized.includes(kw)) ||
    /\b\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b/.test(normalized) ||
    /\b\d{1,2}[:.]\d{2}\b/.test(normalized);
  if (mentionsDate && !session.entities.appointmentDate) {
    flags += 1;
  }

  if (tokens.includes('refund') || normalized.includes('refund')) {
    flags += 0.5;
  }

  return flags >= 2;
}

function ensureSession(sessions, sessionId, timestamp) {
  let session = sessions.get(sessionId);
  if (!session) {
    session = {
      sessionId,
      startedAt: timestamp,
      lastUpdatedAt: timestamp,
      endedAt: null,
      status: 'active',
      success: null,
      successReason: null,
      timeline: [],
      userSentiments: [],
      sentimentCounters: {
        satisfied: 0,
        concerned: 0,
        angry: 0,
      },
      sentimentScoreSum: 0,
      totalUserTurns: 0,
      responseDurations: [],
      assistantTurns: 0,
      hallucinations: 0,
      entities: {},
      lastUserTimestamp: null,
      lastUserTurnId: null,
    };
    sessions.set(sessionId, session);
  }
  return session;
}

class AnalyticsEngine {
  constructor() {
    this.sessions = new Map();
  }

  reset() {
    this.sessions.clear();
  }

  async ingestEvent(event) {
    if (!event || typeof event !== 'object') {
      throw new Error('Invalid analytics event payload');
    }
    const { type } = event;

    switch (type) {
      case 'session_started':
        this.handleSessionStarted(event);
        break;
      case 'session_closed':
        this.handleSessionClosed(event);
        break;
      case 'turn':
        this.handleTurn(event);
        break;
      default:
        throw new Error(`Unsupported analytics event type: ${type}`);
    }
    await this.persistState();
  }

  handleSessionStarted(event) {
    const sessionId = event.sessionId || randomUUID();
    const timestamp = event.timestamp || Date.now();
    ensureSession(this.sessions, sessionId, timestamp);
  }

  handleSessionClosed(event) {
    const sessionId = event.sessionId;
    if (!sessionId) {
      throw new Error('session_closed event missing sessionId');
    }

    const session = ensureSession(this.sessions, sessionId, event.timestamp || Date.now());
    session.status = 'completed';
    session.endedAt = event.timestamp || Date.now();
    session.lastUpdatedAt = session.endedAt;

    if (typeof event.success === 'boolean') {
      session.success = event.success;
      session.successReason = event.reason || null;
    }
  }

  handleTurn(event) {
    const { sessionId, role, text } = event;
    if (!sessionId) {
      throw new Error('turn event missing sessionId');
    }
    if (!role || !['user', 'assistant'].includes(role)) {
      throw new Error('turn event missing or invalid role');
    }
    if (typeof text !== 'string') {
      return;
    }
    const sanitized = sanitizeSensitiveText(text);
    const trimmed = sanitized.trim();
    if (!trimmed) {
      return;
    }

    const timestamp = event.timestamp || Date.now();
    const session = ensureSession(this.sessions, sessionId, timestamp);
    session.lastUpdatedAt = timestamp;

    const turnId = event.turnId || randomUUID();
    const record = {
      turnId,
      role,
      text: trimmed,
      timestamp,
    };

    session.timeline.push(record);

    if (role === 'user') {
      const sentiment = sentimentScore(trimmed);
      session.userSentiments.push({
        ...record,
        sentiment: sentiment.label,
        confidence: sentiment.confidence,
      });
      session.sentimentCounters[sentiment.label] =
        (session.sentimentCounters[sentiment.label] || 0) + 1;
      session.sentimentScoreSum += sentiment.aggregateScore;
      session.totalUserTurns += 1;
      session.lastUserTimestamp = timestamp;
      session.lastUserTurnId = turnId;

      const extractedName = extractName(trimmed);
      if (extractedName) {
        session.entities.customerName = extractedName;
      }
      const extractedService = extractService(trimmed);
      if (extractedService) {
        session.entities.service = extractedService;
      }
      const extractedDate = extractDate(trimmed);
      if (extractedDate) {
        session.entities.appointmentDate = extractedDate;
      }
    } else if (role === 'assistant') {
      session.assistantTurns += 1;
      if (session.lastUserTimestamp) {
        const diff = Math.max(0, timestamp - session.lastUserTimestamp);
        session.responseDurations.push(diff);
        session.lastUserTimestamp = null;
      }

      if (detectHallucination(trimmed, session)) {
        session.hallucinations += 1;
      }

      const normalized = normaliseText(trimmed);
      const successHit = successCues.find((cue) =>
        normalized.includes(normaliseText(cue))
      );
      const failureHit = failureCues.find((cue) =>
        normalized.includes(normaliseText(cue))
      );
      if (successHit) {
        session.success = true;
        session.successReason = successHit;
      } else if (failureHit) {
        session.success = false;
        session.successReason = failureHit;
      }
    }
  }

  getReport() {
    const sessions = Array.from(this.sessions.values()).sort(
      (a, b) => b.startedAt - a.startedAt
    );
    const totalCalls = sessions.length;
    const activeCalls = sessions.filter(
      (session) => session.status === 'active'
    ).length;
    const completedCalls = totalCalls - activeCalls;
    const successfulCalls = sessions.filter(
      (session) => session.success === true
    ).length;
    const failedCalls = sessions.filter(
      (session) => session.success === false
    ).length;

    const allResponseDurations = sessions.flatMap(
      (session) => session.responseDurations
    );
    const averageResponseMs =
      allResponseDurations.length === 0
        ? 0
        : Math.round(
            allResponseDurations.reduce((sum, value) => sum + value, 0) /
              allResponseDurations.length
          );

    const totalAssistantTurns = sessions.reduce(
      (sum, session) => sum + session.assistantTurns,
      0
    );
    const totalHallucinations = sessions.reduce(
      (sum, session) => sum + session.hallucinations,
      0
    );

    const sentimentBearingSessions = sessions.filter(
      (session) => session.totalUserTurns > 0
    );
    const totalSentimentScore = sentimentBearingSessions.reduce(
      (sum, session) =>
        sum + session.sentimentScoreSum / session.totalUserTurns,
      0
    );

    const totalUserTurns = sessions.reduce(
      (sum, session) => sum + session.totalUserTurns,
      0
    );

    const sentimentDistribution = SENTIMENT_LABELS.map((label) => {
      const count = sessions.reduce(
        (sum, session) => sum + (session.sentimentCounters[label] || 0),
        0
      );
      return {
        label,
        count,
        percentage:
          totalUserTurns === 0
            ? 0
            : Math.round((count / totalUserTurns) * 100),
      };
    });

    const recentSessions = sessions.slice(0, 8).map((session) => {
      const avgResponse =
        session.responseDurations.length === 0
          ? 0
          : Math.round(
              session.responseDurations.reduce((sum, v) => sum + v, 0) /
                session.responseDurations.length
            );

      const dominantSentiment = SENTIMENT_LABELS.reduce(
        (acc, label) => {
          const count = session.sentimentCounters[label] || 0;
          if (count > acc.count) {
            return { label, count };
          }
          return acc;
        },
        { label: 'concerned', count: 0 }
      ).label;

      const averageSentimentScore =
        session.totalUserTurns === 0
          ? 0
          : Number(
              (session.sentimentScoreSum / session.totalUserTurns).toFixed(2)
            );

      return sanitizeObject({
        sessionId: session.sessionId,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        status: session.status,
        success: session.success,
        successReason: session.successReason,
        totalTurns: session.timeline.length,
        assistantTurns: session.assistantTurns,
        hallucinations: session.hallucinations,
        averageResponseMs: avgResponse,
        averageSentimentScore,
        dominantSentiment,
        lastUpdate: session.lastUpdatedAt,
        userSentimentTrend: session.userSentiments.slice(-6),
      });
    });

    const latestTimeline = sessions.length
      ? {
          sessionId: sessions[0].sessionId,
          timeline: sessions[0].timeline.slice(-12).map((entry) =>
            sanitizeObject(entry)
          ),
        }
      : null;

    const successRate =
      completedCalls === 0
        ? 0
        : Number(((successfulCalls / completedCalls) * 100).toFixed(1));

    const accuracy = successRate;

    const activeSessions = sanitizeObject(
      sessions
        .filter((session) => session.status === 'active')
        .map((session) => {
          const lastEntry = session.timeline.at(-1);
          return {
            sessionId: session.sessionId,
            startedAt: session.startedAt,
            lastUpdate: session.lastUpdatedAt,
            currentIntent: session.currentIntent,
            userTurns: session.totalUserTurns,
            assistantTurns: session.assistantTurns,
            hallucinations: session.hallucinations,
            dominantSentiment: session.userSentiments.at(-1)?.sentiment,
            lastMessage: lastEntry
              ? {
                  role: lastEntry.role,
                  text: lastEntry.text,
                  timestamp: lastEntry.timestamp,
                }
              : null,
          };
        })
    );

    return {
      generatedAt: Date.now(),
      totals: {
        totalCalls,
        activeCalls,
        completedCalls,
        successfulCalls,
        failedCalls,
        successRate,
        accuracy,
        averageResponseMs,
        averageSentimentScore:
          sentimentBearingSessions.length === 0
            ? 0
            : Number(
                (
                  totalSentimentScore /
                  Math.max(1, sentimentBearingSessions.length)
                ).toFixed(2)
              ),
        hallucinationRate:
          totalAssistantTurns === 0
            ? 0
            : Number(
                (
                  (totalHallucinations / Math.max(1, totalAssistantTurns)) *
                  100
                ).toFixed(1)
              ),
      },
      metrics: {
        accuracy,
        latencyMs: averageResponseMs,
        hallucinationRate:
          totalAssistantTurns === 0
            ? 0
            : Number(
                (
                  (totalHallucinations / Math.max(1, totalAssistantTurns)) *
                  100
                ).toFixed(1)
              ),
      },
      sentimentDistribution,
      recentSessions,
      latestTimeline,
      activeSessions,
    };
  }

  async persistState() {
    try {
      const snapshot = Array.from(this.sessions.entries()).map(([key, value]) => [
        key,
        sanitizeObject(value),
      ]);
      await persistEncryptedJSON(
        'analytics-state.enc',
        snapshot,
        'analytics.sessions.v1'
      );
    } catch (error) {
      console.warn('[analytics] Failed to persist encrypted snapshot', error);
    }
  }
}

module.exports = new AnalyticsEngine();

