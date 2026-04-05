import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { AppService } from './app.service';

@ApiTags('game')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @ApiOperation({ summary: 'API 상태 확인' })
  @Get()
  getHealth() {
    return {
      service: 'AIPOT API',
      status: 'ok',
      version: '1.0.0-mvp',
    };
  }

  @ApiOperation({ summary: '로비 데이터 조회' })
  @ApiQuery({ name: 'mode', required: false, enum: ['guest', 'member'] })
  @Get('lobby')
  getLobby(@Query('mode') mode?: 'guest' | 'member') {
    return this.appService.getLobby(mode ?? 'guest');
  }

  @ApiOperation({ summary: 'AI 봇 목록 조회' })
  @ApiQuery({ name: 'tableType', required: false, enum: ['heads-up', '6-max', '9-max'] })
  @ApiQuery({ name: 'tier', required: false, enum: ['all', 'free', 'premium'] })
  @Get('bots')
  getBots(
    @Query('tableType') tableType?: 'heads-up' | '6-max' | '9-max',
    @Query('tier') tier?: 'all' | 'free' | 'premium',
  ) {
    return this.appService.getBots(tableType, tier ?? 'all');
  }

  @ApiOperation({ summary: '빠른 시작 세션 생성' })
  @Post('lobby/quick-start')
  createQuickStart(
    @Body()
    body: {
      mode?: 'guest' | 'member';
      tableType?: 'heads-up' | '6-max' | '9-max';
      difficulty?: 'easy' | 'normal' | 'hard';
    },
  ) {
    return this.appService.createQuickStart(body);
  }

  @ApiOperation({ summary: '실제 플레이 핸드 시작' })
  @Post('play/start')
  startPlayableHand(
    @Body()
    body: {
      mode?: 'guest' | 'member';
      tableType?: 'heads-up' | '6-max' | '9-max';
      difficulty?: 'easy' | 'normal' | 'hard';
      aiModel?: 'random' | 'openai' | 'gemini' | 'anthropic';
    },
  ) {
    return this.appService.startPlayableHand(body);
  }

  @ApiOperation({ summary: '플레이 핸드 상태 조회' })
  @Get('play/:sessionId')
  async getPlayableHand(@Param('sessionId') sessionId: string) {
    return this.appService.getPlayableHand(sessionId);
  }

  @ApiOperation({ summary: '플레이 액션 수행' })
  @Post('play/:sessionId/action')
  async applyPlayerAction(
    @Param('sessionId') sessionId: string,
    @Body() body: { action: 'fold' | 'check' | 'call' | 'bet' | 'raise' },
  ) {
    return this.appService.applyPlayerAction(sessionId, body.action);
  }

  @ApiOperation({ summary: '오늘의 미션 조회' })
  @Get('missions/today')
  getTodayMissions() {
    return this.appService.getTodayMissions();
  }

  @ApiOperation({ summary: '최근 복기 목록 조회' })
  @Get('reports/recent')
  getRecentReports() {
    return this.appService.getRecentReports();
  }

  @ApiOperation({ summary: '복기 상세 조회' })
  @Get('reports/:reportId')
  getReportDetail(@Param('reportId') reportId: string, @Query('premium') premium?: string) {
    return this.appService.getReportDetail(reportId, premium === 'true');
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'JWT 인증 사용자 정보 확인' })
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Req() req: { user: { userId: number; email: string; nickname: string } }) {
    return req.user;
  }
}
