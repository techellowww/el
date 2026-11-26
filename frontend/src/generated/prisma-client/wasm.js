
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 6.4.1
 * Query Engine version: a9055b89e58b4b5bfb59600785423b1db3d0e75d
 */
Prisma.prismaVersion = {
  client: "6.4.1",
  engine: "a9055b89e58b4b5bfb59600785423b1db3d0e75d"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.AccountScalarFieldEnum = {
  id: 'id',
  name: 'name',
  currency: 'currency',
  logoUrl: 'logoUrl',
  replyToEmail: 'replyToEmail',
  emailSettings: 'emailSettings',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.UserScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  email: 'email',
  passwordHash: 'passwordHash',
  name: 'name',
  displayName: 'displayName',
  title: 'title',
  phone: 'phone',
  avatarUrl: 'avatarUrl',
  timezone: 'timezone',
  bio: 'bio',
  department: 'department',
  employeeId: 'employeeId',
  role: 'role',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ClientScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  name: 'name',
  company: 'company',
  email: 'email',
  phone: 'phone',
  notes: 'notes',
  portalTokenHash: 'portalTokenHash',
  portalTokenExpiresAt: 'portalTokenExpiresAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ClientAssignmentScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  clientId: 'clientId',
  userId: 'userId',
  assignedAt: 'assignedAt'
};

exports.Prisma.ProjectScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  clientId: 'clientId',
  name: 'name',
  description: 'description',
  stage: 'stage',
  stagingUrl: 'stagingUrl',
  liveUrl: 'liveUrl',
  budgetHours: 'budgetHours',
  hourlyRateCents: 'hourlyRateCents',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.StatusUpdateScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  projectId: 'projectId',
  userId: 'userId',
  title: 'title',
  body: 'body',
  notifyClient: 'notifyClient',
  createdAt: 'createdAt'
};

exports.Prisma.TimeEntryScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  userId: 'userId',
  projectId: 'projectId',
  clientId: 'clientId',
  description: 'description',
  deviceId: 'deviceId',
  lastActivityAt: 'lastActivityAt',
  startedAt: 'startedAt',
  stoppedAt: 'stoppedAt',
  durationSeconds: 'durationSeconds',
  isRunning: 'isRunning',
  isLocked: 'isLocked',
  invoiceId: 'invoiceId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.EventScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  clientId: 'clientId',
  projectId: 'projectId',
  createdById: 'createdById',
  title: 'title',
  description: 'description',
  startTime: 'startTime',
  endTime: 'endTime',
  locationUrl: 'locationUrl',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.EventAttendeeScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  eventId: 'eventId',
  userId: 'userId',
  email: 'email',
  name: 'name',
  isClient: 'isClient'
};

exports.Prisma.ProposalScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  clientId: 'clientId',
  projectId: 'projectId',
  title: 'title',
  status: 'status',
  tokenHash: 'tokenHash',
  currentVersionNumber: 'currentVersionNumber',
  sentAt: 'sentAt',
  expiresAt: 'expiresAt',
  declinedAt: 'declinedAt',
  declineReason: 'declineReason',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ProposalVersionScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  proposalId: 'proposalId',
  versionNumber: 'versionNumber',
  contentJson: 'contentJson',
  contentHtml: 'contentHtml',
  contentHash: 'contentHash',
  logoSnapshotUrl: 'logoSnapshotUrl',
  isLocked: 'isLocked',
  createdAt: 'createdAt'
};

exports.Prisma.ProposalSignatureScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  proposalId: 'proposalId',
  versionId: 'versionId',
  signerName: 'signerName',
  signerEmail: 'signerEmail',
  signatureData: 'signatureData',
  ipAddress: 'ipAddress',
  signedAt: 'signedAt',
  pdfUrl: 'pdfUrl'
};

exports.Prisma.AiGenerationScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  prompt: 'prompt',
  response: 'response',
  tokensUsed: 'tokensUsed',
  createdAt: 'createdAt'
};

exports.Prisma.InvoiceScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  clientId: 'clientId',
  projectId: 'projectId',
  invoiceNumber: 'invoiceNumber',
  invoiceNumberDisplay: 'invoiceNumberDisplay',
  status: 'status',
  tokenHash: 'tokenHash',
  currency: 'currency',
  subtotalCents: 'subtotalCents',
  taxCents: 'taxCents',
  totalCents: 'totalCents',
  dueDate: 'dueDate',
  sentAt: 'sentAt',
  paidAt: 'paidAt',
  voidedAt: 'voidedAt',
  notes: 'notes',
  logoSnapshotUrl: 'logoSnapshotUrl',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.InvoiceItemScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  invoiceId: 'invoiceId',
  description: 'description',
  quantity: 'quantity',
  unitPriceCents: 'unitPriceCents',
  totalCents: 'totalCents',
  timeEntryId: 'timeEntryId'
};

exports.Prisma.PaymentScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  invoiceId: 'invoiceId',
  amountCents: 'amountCents',
  currency: 'currency',
  paymentMethod: 'paymentMethod',
  notes: 'notes',
  paidAt: 'paidAt',
  createdAt: 'createdAt'
};

exports.Prisma.MessageScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  clientId: 'clientId',
  projectId: 'projectId',
  senderType: 'senderType',
  senderUserId: 'senderUserId',
  clientSenderName: 'clientSenderName',
  content: 'content',
  attachmentUrl: 'attachmentUrl',
  attachmentName: 'attachmentName',
  attachmentSize: 'attachmentSize',
  isInternalNote: 'isInternalNote',
  isDeleted: 'isDeleted',
  editedAt: 'editedAt',
  createdAt: 'createdAt'
};

exports.Prisma.MessageReadScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  clientId: 'clientId',
  userId: 'userId',
  isClient: 'isClient',
  lastReadMessageId: 'lastReadMessageId',
  lastReadAt: 'lastReadAt'
};

exports.Prisma.NotificationScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  type: 'type',
  recipientEmail: 'recipientEmail',
  subject: 'subject',
  bodyHtml: 'bodyHtml',
  metadata: 'metadata',
  status: 'status',
  retryCount: 'retryCount',
  errorLog: 'errorLog',
  scheduledFor: 'scheduledFor',
  sentAt: 'sentAt',
  createdAt: 'createdAt'
};

exports.Prisma.AuditLogScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  userId: 'userId',
  action: 'action',
  entityType: 'entityType',
  entityId: 'entityId',
  details: 'details',
  ipAddress: 'ipAddress',
  createdAt: 'createdAt'
};

exports.Prisma.OfficeScheduleScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  openingTime: 'openingTime',
  closingTime: 'closingTime',
  workingDays: 'workingDays',
  timezone: 'timezone',
  allowOutsideHours: 'allowOutsideHours',
  autoCutoffEnabled: 'autoCutoffEnabled',
  dayTimings: 'dayTimings',
  updatedById: 'updatedById',
  updatedAt: 'updatedAt'
};

exports.Prisma.ScreenshotSettingScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  enabled: 'enabled',
  intervalMinutes: 'intervalMinutes',
  retentionDays: 'retentionDays',
  requireConsent: 'requireConsent',
  consentNotice: 'consentNotice',
  updatedAt: 'updatedAt'
};

exports.Prisma.ScreenshotRecordScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  userId: 'userId',
  timeEntryId: 'timeEntryId',
  capturedAt: 'capturedAt',
  imageUrl: 'imageUrl',
  fileSize: 'fileSize',
  metadata: 'metadata',
  viewedAt: 'viewedAt',
  viewedById: 'viewedById'
};

exports.Prisma.EmailScheduleSettingScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  enabled: 'enabled',
  scheduleType: 'scheduleType',
  scheduleTime: 'scheduleTime',
  dailyEnabled: 'dailyEnabled',
  dailyTime: 'dailyTime',
  weeklyEnabled: 'weeklyEnabled',
  weeklyDay: 'weeklyDay',
  weeklyTime: 'weeklyTime',
  monthlyEnabled: 'monthlyEnabled',
  monthlyDay: 'monthlyDay',
  monthlyTime: 'monthlyTime',
  recipients: 'recipients',
  timezone: 'timezone',
  smtpHost: 'smtpHost',
  smtpPort: 'smtpPort',
  smtpUser: 'smtpUser',
  smtpPass: 'smtpPass',
  smtpFrom: 'smtpFrom',
  lastSentKey: 'lastSentKey',
  updatedAt: 'updatedAt'
};

exports.Prisma.EmailDeliveryLogScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  type: 'type',
  recipient: 'recipient',
  subject: 'subject',
  status: 'status',
  content: 'content',
  error: 'error',
  retryCount: 'retryCount',
  sentAt: 'sentAt',
  createdAt: 'createdAt'
};

exports.Prisma.SubProjectScalarFieldEnum = {
  id: 'id',
  projectId: 'projectId',
  accountId: 'accountId',
  name: 'name',
  description: 'description',
  stage: 'stage',
  budgetHours: 'budgetHours',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};


exports.Prisma.ModelName = {
  Account: 'Account',
  User: 'User',
  Client: 'Client',
  ClientAssignment: 'ClientAssignment',
  Project: 'Project',
  StatusUpdate: 'StatusUpdate',
  TimeEntry: 'TimeEntry',
  Event: 'Event',
  EventAttendee: 'EventAttendee',
  Proposal: 'Proposal',
  ProposalVersion: 'ProposalVersion',
  ProposalSignature: 'ProposalSignature',
  AiGeneration: 'AiGeneration',
  Invoice: 'Invoice',
  InvoiceItem: 'InvoiceItem',
  Payment: 'Payment',
  Message: 'Message',
  MessageRead: 'MessageRead',
  Notification: 'Notification',
  AuditLog: 'AuditLog',
  OfficeSchedule: 'OfficeSchedule',
  ScreenshotSetting: 'ScreenshotSetting',
  ScreenshotRecord: 'ScreenshotRecord',
  EmailScheduleSetting: 'EmailScheduleSetting',
  EmailDeliveryLog: 'EmailDeliveryLog',
  SubProject: 'SubProject'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
