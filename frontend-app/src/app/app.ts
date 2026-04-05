import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { MatchupSummaryResponse } from './matchup.models';
import { MatchupService } from './matchup.service';

@Component({
  selector: 'app-root',
  imports: [CommonModule, ReactiveFormsModule, DatePipe, DecimalPipe],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly fb = inject(FormBuilder);
  private readonly matchupService = inject(MatchupService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly result = signal<MatchupSummaryResponse | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    gameName: ['FullStack Java', [Validators.required, Validators.minLength(3)]],
    tagLine: ['DEV', [Validators.required, Validators.minLength(2)]],
    championA: ['Aatrox', [Validators.required]],
    championB: ['Darius', [Validators.required]],
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.result.set(null);

    this.matchupService
      .analyzeTopLaneMatchup(this.form.getRawValue())
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (response) => this.result.set(response),
        error: (error: Error) => {
          this.result.set(null);
          this.error.set(error.message);
        },
      });
  }
}
