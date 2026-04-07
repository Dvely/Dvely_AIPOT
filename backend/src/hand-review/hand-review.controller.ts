import {
	Body,
	Controller,
	Get,
	Param,
	Post,
	UseGuards,
} from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiOperation,
	ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtUserPayload } from '../common/domain.types';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AnalyzeHandDto } from './dto/analyze-hand.dto';
import { HandReviewService } from './hand-review.service';

@ApiTags('hand-review')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('hand-review')
export class HandReviewController {
	constructor(private readonly handReviewService: HandReviewService) {}

	@Get('hands')
	@ApiOperation({ summary: '핸드 히스토리 목록 조회' })
	listHands(@CurrentUser() user: JwtUserPayload) {
		return this.handReviewService.listHands(user);
	}

	@Get('hands/:handId')
	@ApiOperation({ summary: '핸드 히스토리 상세 조회' })
	detail(@CurrentUser() user: JwtUserPayload, @Param('handId') handId: string) {
		return this.handReviewService.getHand(user, handId);
	}

	@Post('hands/:handId/analyze')
	@ApiOperation({ summary: 'LLM 심화 핸드 리뷰 분석(PRO)' })
	analyze(
		@CurrentUser() user: JwtUserPayload,
		@Param('handId') handId: string,
		@Body() dto: AnalyzeHandDto,
	) {
		return this.handReviewService.analyze(user, handId, dto);
	}
}
