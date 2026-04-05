import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, Observable, throwError } from 'rxjs';
import { AnalyzeMatchupRequest, MatchupSummaryResponse } from './matchup.models';

@Injectable({
  providedIn: 'root',
})
export class MatchupService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = '/api/matchup';

  analyzeTopLaneMatchup(payload: AnalyzeMatchupRequest): Observable<MatchupSummaryResponse> {
    const params = new HttpParams()
      .set('gameName', payload.gameName)
      .set('tagLine', payload.tagLine)
      .set('championA', payload.championA)
      .set('championB', payload.championB);

    return this.http
      .get<MatchupSummaryResponse>(`${this.apiBaseUrl}/analyze`, { params })
      .pipe(catchError((error) => this.handleError(error)));
  }

  private handleError(error: HttpErrorResponse) {
    if (error.status === 429) {
      return throwError(() => new Error('Rate limit da Riot API atingido. Tente novamente em instantes.'));
    }

    return throwError(() => new Error(error.error?.message || 'Falha ao analisar matchup.'));
  }
}
