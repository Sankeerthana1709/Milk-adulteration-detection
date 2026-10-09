import os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd
import numpy as np
from sklearn.feature_selection import mutual_info_classif

# Setup directories
PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_PATH = os.path.join(PROJECT_DIR, 'data', 'milk_calibration_final.csv')
ARTIFACT_DIR = r'C:\Users\aruna\.gemini\antigravity-ide\brain\d3062479-2fad-465c-b9d6-4f2de8a0f429'
PLOTS_DIR = os.path.join(PROJECT_DIR, 'reports', 'figures')
os.makedirs(ARTIFACT_DIR, exist_ok=True)
os.makedirs(PLOTS_DIR, exist_ok=True)

df = pd.read_csv(DATA_PATH)
features = ['Temperature_Celsius', 'Fat', 'Turbidity', 'Color', 'pH']

# Dark aesthetic
plt.style.use('dark_background')
palette = {'Medium': '#f59e0b', 'Low': '#ef4444'}

print("=== 1. DATASET OVERVIEW ===")
print(f"Total Rows: {len(df)}")
print(f"Columns: {list(df.columns)}")
print(f"Missing Values: {df.isnull().sum().to_dict()}")
print(f"Class Distribution:\n{df['Grade'].value_counts(dropna=False)}")

# 1. Plot: Class Distribution & Mutual Information
fig, axes = plt.subplots(1, 2, figsize=(14, 6))
fig.patch.set_facecolor('#0f172a')
for ax in axes:
    ax.set_facecolor('#1e293b')

class_counts = df['Grade'].value_counts()
colors = [palette[g] for g in class_counts.index]
bars = axes[0].bar(class_counts.index, class_counts.values, color=colors, edgecolor='#334155', linewidth=1.5)
axes[0].set_title('Adulteration Grade Distribution (N=1,059)', fontsize=14, fontweight='bold', color='#f8fafc', pad=12)
axes[0].set_ylabel('Sample Count', fontsize=11, color='#94a3b8')
axes[0].grid(axis='y', linestyle='--', alpha=0.3, color='#475569')

for bar in bars:
    yval = bar.get_height()
    pct = yval / len(df) * 100
    axes[0].text(bar.get_x() + bar.get_width()/2.0, yval + 15, f'{yval}\n({pct:.1f}%)', 
                 ha='center', va='bottom', fontsize=11, fontweight='bold', color='#f8fafc')

# Mutual Information
y_num = df['Grade'].map({'Low': 0, 'Medium': 1})
mi = mutual_info_classif(df[features], y_num, random_state=42)
mi_series = pd.Series(mi, index=features).sort_values(ascending=True)

axes[1].barh(mi_series.index, mi_series.values, color='#38bdf8', edgecolor='#0284c7', linewidth=1.5)
axes[1].set_title('Sensor Predictive Power (Mutual Information)', fontsize=14, fontweight='bold', color='#f8fafc', pad=12)
axes[1].set_xlabel('Mutual Information (Nats)', fontsize=11, color='#94a3b8')
axes[1].grid(axis='x', linestyle='--', alpha=0.3, color='#475569')
for i, v in enumerate(mi_series.values):
    axes[1].text(v + 0.005, i, f'{v:.3f}', va='center', fontsize=10, fontweight='bold', color='#f8fafc')

plt.tight_layout()
p1_art = os.path.join(ARTIFACT_DIR, 'eda_calibration_class_distribution.png')
p1_loc = os.path.join(PLOTS_DIR, 'eda_calibration_class_distribution.png')
plt.savefig(p1_art, dpi=200, facecolor=fig.get_facecolor())
plt.savefig(p1_loc, dpi=200, facecolor=fig.get_facecolor())
plt.close()

# 2. Plot: Sensor Breakdown by Grade
fig, axes = plt.subplots(2, 3, figsize=(16, 10))
fig.patch.set_facecolor('#0f172a')
axes = axes.flatten()

# pH Boxplot
ax = axes[0]
ax.set_facecolor('#1e293b')
sns.boxplot(data=df, x='Grade', y='pH', hue='Grade', palette=palette, order=['Medium', 'Low'], legend=False, ax=ax)
ax.axhspan(6.5, 6.8, color='#10b981', alpha=0.15, label='Fresh Reference Range (6.5-6.8)')
ax.set_title('pH Distribution: Medium vs Low', fontsize=12, fontweight='bold', color='#f8fafc')
ax.grid(axis='y', linestyle='--', alpha=0.3, color='#475569')
ax.legend(loc='lower left', fontsize=9)

# Temperature Boxplot
ax = axes[1]
ax.set_facecolor('#1e293b')
sns.boxplot(data=df, x='Grade', y='Temperature_Celsius', hue='Grade', palette=palette, order=['Medium', 'Low'], legend=False, ax=ax)
ax.set_title('Temperature (°C): Medium vs Low', fontsize=12, fontweight='bold', color='#f8fafc')
ax.grid(axis='y', linestyle='--', alpha=0.3, color='#475569')

# Color Boxplot
ax = axes[2]
ax.set_facecolor('#1e293b')
sns.boxplot(data=df, x='Grade', y='Color', hue='Grade', palette=palette, order=['Medium', 'Low'], legend=False, ax=ax)
ax.set_title('Optical Color (TCS34725) by Grade', fontsize=12, fontweight='bold', color='#f8fafc')
ax.grid(axis='y', linestyle='--', alpha=0.3, color='#475569')

# Fat Proportion Bar
ax = axes[3]
ax.set_facecolor('#1e293b')
fat_prop = df.groupby('Grade')['Fat'].mean().reindex(['Medium', 'Low']) * 100
bars = ax.bar(fat_prop.index, fat_prop.values, color=[palette[g] for g in fat_prop.index], edgecolor='#334155')
ax.set_title('Fat Presence Rate (%) by Grade', fontsize=12, fontweight='bold', color='#f8fafc')
ax.set_ylabel('Percentage with Fat=1', fontsize=10, color='#94a3b8')
ax.grid(axis='y', linestyle='--', alpha=0.3, color='#475569')
for bar in bars:
    yval = bar.get_height()
    ax.text(bar.get_x() + bar.get_width()/2.0, yval + 2, f'{yval:.1f}%', ha='center', fontsize=10, fontweight='bold', color='#f8fafc')

# Turbidity Proportion Bar
ax = axes[4]
ax.set_facecolor('#1e293b')
turb_prop = df.groupby('Grade')['Turbidity'].mean().reindex(['Medium', 'Low']) * 100
bars = ax.bar(turb_prop.index, turb_prop.values, color=[palette[g] for g in turb_prop.index], edgecolor='#334155')
ax.set_title('Turbidity Rate (%) by Grade', fontsize=12, fontweight='bold', color='#f8fafc')
ax.set_ylabel('Percentage with Turbidity=1', fontsize=10, color='#94a3b8')
ax.grid(axis='y', linestyle='--', alpha=0.3, color='#475569')
for bar in bars:
    yval = bar.get_height()
    ax.text(bar.get_x() + bar.get_width()/2.0, yval + 2, f'{yval:.1f}%', ha='center', fontsize=10, fontweight='bold', color='#f8fafc')

# Correlation Heatmap
ax = axes[5]
ax.set_facecolor('#1e293b')
corr_matrix = df[features].corr()
sns.heatmap(corr_matrix, annot=True, fmt='.2f', cmap='coolwarm', cbar=False, ax=ax, linewidths=1, linecolor='#0f172a')
ax.set_title('Sensor Cross-Correlation', fontsize=12, fontweight='bold', color='#f8fafc')

plt.tight_layout()
p2_art = os.path.join(ARTIFACT_DIR, 'eda_calibration_sensor_breakdown.png')
p2_loc = os.path.join(PLOTS_DIR, 'eda_calibration_sensor_breakdown.png')
plt.savefig(p2_art, dpi=200, facecolor=fig.get_facecolor())
plt.savefig(p2_loc, dpi=200, facecolor=fig.get_facecolor())
plt.close()

# 3. Plot: Sensor Decision Plane (pH vs Temperature)
plt.figure(figsize=(10, 7), facecolor='#0f172a')
ax = plt.gca()
ax.set_facecolor('#1e293b')

jitter_temp = df['Temperature_Celsius'] + np.random.normal(0, 0.4, size=len(df))
jitter_ph = df['pH'] + np.random.normal(0, 0.04, size=len(df))

for g in ['Low', 'Medium']:
    mask = df['Grade'] == g
    ax.scatter(jitter_ph[mask], jitter_temp[mask], color=palette[g], label=f'{g} Quality (N={mask.sum()})', 
               alpha=0.6, s=40, edgecolors='none')

ax.set_title('Sensor Decision Space: pH vs Temperature (Calibration Dataset)', fontsize=14, fontweight='bold', color='#f8fafc', pad=12)
ax.set_xlabel('pH (Acidity / Alkalinity)', fontsize=12, color='#94a3b8')
ax.set_ylabel('Temperature (°C)', fontsize=12, color='#94a3b8')
ax.grid(True, linestyle='--', alpha=0.3, color='#475569')
ax.legend(loc='upper left', fontsize=10, facecolor='#0f172a', edgecolor='#475569')

p3_art = os.path.join(ARTIFACT_DIR, 'eda_calibration_sensor_decision_plane.png')
p3_loc = os.path.join(PLOTS_DIR, 'eda_calibration_sensor_decision_plane.png')
plt.savefig(p3_art, dpi=200, facecolor='#0f172a')
plt.savefig(p3_loc, dpi=200, facecolor='#0f172a')
plt.close()

print(f"Plots successfully generated and saved to {ARTIFACT_DIR} and {PLOTS_DIR}")
