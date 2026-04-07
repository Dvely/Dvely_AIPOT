import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiOperation,
	ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtUserPayload } from '../common/domain.types';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AiService } from './ai.service';
import { BotActionRequestDto } from './dto/bot-action-request.dto';
import { HandReviewRequestDto } from './dto/hand-review-request.dto';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
	constructor(private readonly aiService: AiService) {}

	@Post('bot-action')
	@ApiOperation({ summary: 'LLM 기반 AI Bot 행동 결정' })
	botAction(
		@CurrentUser() user: JwtUserPayload,
		@Body() dto: BotActionRequestDto,
	) {
		return this.aiService.generateBotAction(dto, user.role);
	}

	@Post('hand-review')
	@ApiOperation({ summary: 'LLM 기반 핸드 리뷰 분석' })
	handReview(@Body() dto: HandReviewRequestDto) {
		return this.aiService.analyzeHandReview(dto);
	}
}
