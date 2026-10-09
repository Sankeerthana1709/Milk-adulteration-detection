import pandas as pd
import numpy as np
from sklearn.feature_selection import mutual_info_classif

df = pd.read_csv('data/benchmark_5_sensors.csv')

print('=== UNIQUE VALUES PER FEATURE ===')
for col in df.columns:
    u = df[col].unique()
    if len(u) <= 15:
        print(f'{col:20s} ({len(u)} unique): {sorted(u)}')
    else:
        print(f'{col:20s} ({len(u)} unique): {sorted(u)[:8]} ... {sorted(u)[-4:]}')

print('\n=== GROUPED BY GRADE (MEANS) ===')
print(df.groupby('Grade').mean(numeric_only=True).round(3))

print('\n=== GROUPED BY GRADE (MEDIANS) ===')
print(df.groupby('Grade').median(numeric_only=True).round(3))

print('\n=== GROUPED BY GRADE (MIN & MAX) ===')
for g in ['High', 'Medium', 'Low']:
    sub = df[df['Grade'] == g]
    print(f'-- {g} (N={len(sub)}) --')
    for col in ['Temperature_Celsius', 'Fat', 'Turbidity', 'Color', 'pH']:
        print(f'   {col:20s}: min={sub[col].min():5.1f}, max={sub[col].max():5.1f}, mean={sub[col].mean():5.2f}, std={sub[col].std():5.2f}')

print('\n=== DUPLICATE ANALYSIS ===')
n_dup = df.duplicated().sum()
print(f'Total exact duplicate rows: {n_dup} out of {len(df)} ({n_dup/len(df)*100:.2f}%)')
feature_cols = ['Temperature_Celsius', 'Fat', 'Turbidity', 'Color', 'pH']
dup_feats = df.duplicated(subset=feature_cols, keep=False).sum()
print(f'Rows with duplicate feature combinations: {dup_feats}')

# Conflicting labels check
conflicts = df.groupby(feature_cols)['Grade'].nunique()
conflicting_patterns = conflicts[conflicts > 1]
print(f'Conflicting feature patterns (same sensors, different grades): {len(conflicting_patterns)}')
if len(conflicting_patterns) > 0:
    print('Examples of conflicting rows:')
    for pattern in list(conflicting_patterns.index)[:5]:
        match = df[(df[feature_cols] == pattern).all(axis=1)]
        print(f'Pattern {pattern} -> {dict(match["Grade"].value_counts())}')

# Mutual Information & Correlations
grade_map = {'Low': 0, 'Medium': 1, 'High': 2}
y = df['Grade'].map(grade_map)
X = df[feature_cols]
mi = mutual_info_classif(X, y, random_state=42)
print('\n=== MUTUAL INFORMATION WITH GRADE ===')
for col, score in sorted(zip(feature_cols, mi), key=lambda x: x[1], reverse=True):
    print(f'   {col:20s}: {score:.4f}')

corr = df[feature_cols].copy()
corr['Grade_Numeric'] = y
print('\n=== CORRELATION WITH GRADE_NUMERIC (PEARSON) ===')
print(corr.corr()['Grade_Numeric'].sort_values(ascending=False).round(4))
print('\n=== FULL FEATURE CORRELATION MATRIX ===')
print(df[feature_cols].corr().round(3))
