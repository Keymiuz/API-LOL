import { CommonModule } from '@angular/common';
import { Component, OnDestroy } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { BehaviorSubject, Subject, EMPTY } from 'rxjs';
import { catchError, finalize, switchMap, takeUntil, tap } from 'rxjs/operators';
import { MatchupSummaryResponse } from '../../core/models/matchup.models';
import { MatchupService } from '../../core/services/matchup.service';

@Component({
  selector: 'app-matchup-analyzer',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: '',
})
export class MatchupAnalyzerComponent implements OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly submit$ = new Subject<void>();

  readonly loading$ = new BehaviorSubject<boolean>(false);
  readonly error$ = new BehaviorSubject<string | null>(null);
  readonly result$ = new BehaviorSubject<MatchupSummaryResponse | null>(null);

  readonly form = this.fb.nonNullable.group({
    gameName: ['', [Validators.required, Validators.minLength(3)]],
    tagLine: ['', [Validators.required, Validators.minLength(2)]],
    championA: ['', [Validators.required]],
    championB: ['', [Validators.required]],
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly matchupService: MatchupService,
  ) {
    this.bindSubmitPipeline();
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submit$.next();
  }

  private bindSubmitPipeline(): void {
    this.submit$
      .pipe(
        tap(() => {
          this.loading$.next(true);
          this.error$.next(null);
        }),
        switchMap(() =>
          this.matchupService.analyzeTopLaneMatchup(this.form.getRawValue()).pipe(
            tap((response) => this.result$.next(response)),
            catchError((error: Error) => {
              this.error$.next(error.message);
              this.result$.next(null);
              return EMPTY;
            }),
            finalize(() => this.loading$.next(false)),
          ),
        ),
        takeUntil(this.destroy$),
      )
      .subscribe();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.loading$.complete();
    this.error$.complete();
    this.result$.complete();
  }
}
