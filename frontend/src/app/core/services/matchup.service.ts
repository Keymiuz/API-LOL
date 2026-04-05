import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AnalyzeMatchupRequest, MatchupSummaryResponse } from '../models/matchup.models';

@Injectable({
  providedIn: 'root',
})
export class MatchupService {
  private readonly apiBaseUrl = '/api/matchup';

  constructor(private readonly http: HttpClient) {}

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
