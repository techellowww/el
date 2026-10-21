"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const timer_routes_1 = __importDefault(require("./routes/timer.routes"));
const projects_routes_1 = __importDefault(require("./routes/projects.routes"));
const timeEntries_routes_1 = __importDefault(require("./routes/timeEntries.routes"));
const corrections_routes_1 = __importDefault(require("./routes/corrections.routes"));
const employees_routes_1 = __importDefault(require("./routes/employees.routes"));
const dashboard_routes_1 = __importDefault(require("./routes/dashboard.routes"));
const reports_routes_1 = __importDefault(require("./routes/reports.routes"));
const settings_routes_1 = __importDefault(require("./routes/settings.routes"));
const screenshots_routes_1 = __importDefault(require("./routes/screenshots.routes"));
const cronScheduler_1 = require("./lib/cronScheduler");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';
app.use((0, cors_1.default)({
    origin: [CLIENT_URL, 'http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true,
}));
app.use((0, cookie_parser_1.default)());
app.use(express_1.default.json());
// API Routes
app.use('/api/auth', auth_routes_1.default);
app.use('/api/timer', timer_routes_1.default);
app.use('/api/projects', projects_routes_1.default);
app.use('/api/time-entries', timeEntries_routes_1.default);
app.use('/api/corrections', corrections_routes_1.default);
app.use('/api/admin/employees', employees_routes_1.default);
app.use('/api/admin/dashboard', dashboard_routes_1.default);
app.use('/api/admin', settings_routes_1.default); // for /api/admin/audit-logs
app.use('/api/reports', reports_routes_1.default);
app.use('/api/settings', settings_routes_1.default);
app.use('/api/screenshots', screenshots_routes_1.default);
// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'EL App Backend API',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
    });
});
// Start Background Worker & Scheduler
(0, cronScheduler_1.initBackgroundScheduler)();
app.listen(PORT, () => {
    console.log(`🚀 EL App Backend Server running on http://localhost:${PORT}`);
    console.log(`📡 CORS configured for origin: ${CLIENT_URL}`);
});
