import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../lib/auth';
import {
  getDailyReport,
  getWeeklyReport,
  getCustomReport,
  getCompletedProjectReports,
  exportToCSV,
  exportToExcel,
  formatDurationDetailed,
} from '../lib/reportEngine';
import { format } from 'date-fns';

const router = Router();

router.get('/daily', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const rawDate = req.query.date as string | undefined;
    const dateParam = rawDate && rawDate.trim() ? rawDate.trim() : undefined;
    const projectFilter = req.query.projectId as string | undefined;
    let userFilter = req.query.userId as string | undefined;

    if (req.user!.role !== 'ADMIN') {
      userFilter = req.user!.id;
    }

    const report = await getDailyReport({
      date: dateParam,
      userId: userFilter === 'ALL' ? undefined : userFilter,
      projectId: projectFilter === 'ALL' ? undefined : projectFilter,
    });

    res.json({ report });
  } catch (error) {
    console.error('Error in daily report:', error);
    res.status(500).json({ error: 'Failed to generate daily report' });
  }
});

router.get('/weekly', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const rawDate = req.query.date as string | undefined;
    const dateParam = rawDate && rawDate.trim() ? rawDate.trim() : undefined;
    const projectFilter = req.query.projectId as string | undefined;
    let userFilter = req.query.userId as string | undefined;

    if (req.user!.role !== 'ADMIN') {
      userFilter = req.user!.id;
    }

    const report = await getWeeklyReport({
      date: dateParam,
      userId: userFilter === 'ALL' ? undefined : userFilter,
      projectId: projectFilter === 'ALL' ? undefined : projectFilter,
    });

    res.json({ report });
  } catch (error) {
    console.error('Error in weekly report:', error);
    res.status(500).json({ error: 'Failed to generate weekly report' });
  }
});

router.get('/custom', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const projectId = req.query.projectId as string | undefined;
    const classification = req.query.classification as string | undefined;
    let userId = req.query.userId as string | undefined;

    if (req.user!.role !== 'ADMIN') {
      userId = req.user!.id;
    }

    const report = await getCustomReport({
      startDate,
      endDate,
      projectId,
      userId,
      classification,
    });

    res.json({ report });
  } catch (error) {
    console.error('Error generating custom report:', error);
    res.status(500).json({ error: 'Failed to generate custom date range report' });
  }
});

router.get('/completed-projects', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const reports = await getCompletedProjectReports();
    res.json({ completedProjects: reports });
  } catch (error) {
    console.error('Error fetching completed project reports:', error);
    res.status(500).json({ error: 'Failed to retrieve completed project reports' });
  }
});

router.get('/export', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const exportFormat = (req.query.format as string) || 'csv';
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const projectId = req.query.projectId as string | undefined;
    let userId = req.query.userId as string | undefined;

    if (req.user!.role !== 'ADMIN') {
      userId = req.user!.id;
    }

    const report = await getCustomReport({
      startDate,
      endDate,
      projectId,
      userId,
    });

    const flattenedData = report.entries.map((entry) => ({
      'Entry ID': entry.id,
      'Employee ID': entry.user.employeeId,
      'Employee Name': entry.user.name,
      'Department': entry.user.department || 'N/A',
      'Project Code': entry.project.code,
      'Project Name': entry.project.name,
      'Start Time (UTC)': format(entry.startTime, 'yyyy-MM-dd HH:mm:ss'),
      'End Time (UTC)': entry.endTime ? format(entry.endTime, 'yyyy-MM-dd HH:mm:ss') : 'RUNNING',
      'Duration': formatDurationDetailed(entry.duration),
      'Duration (Hours)': Number((entry.duration / 3600).toFixed(2)),
      'Classification': entry.classification,
      'Outside Hours': entry.isOutsideHours ? 'YES' : 'NO',
      'Source': entry.source,
      'Status': entry.status,
      'Notes': entry.notes || '',
    }));

    const filename = `el-app-report-${format(new Date(), 'yyyy-MM-dd')}`;

    if (exportFormat === 'excel') {
      const excelBuffer = exportToExcel({
        'Time Records': flattenedData,
      });

      res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(excelBuffer);
    } else {
      const csvContent = exportToCSV(flattenedData);

      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.send(csvContent);
    }
  } catch (error) {
    console.error('Error exporting reports:', error);
    res.status(500).json({ error: 'Failed to export report data' });
  }
});

export default router;
