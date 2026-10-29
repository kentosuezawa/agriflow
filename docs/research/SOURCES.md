# 調査根拠・参照文献（2026-10-29確認）

この資料は製品仮説と要求定義のための背景資料であり、AgriFlowに実利用者の需要が存在することの証明ではない。

## 公的背景

1. 農林水産省「2025年農林業センサス結果の概要（概数値）」（2025-11-28公表）  
   https://www.maff.go.jp/j/tokei/kekka_gaiyou/noucen/040909/index.html  
   2025年の農業経営体は約82.8万（概数）で、5年前から減少。農業経営環境の背景を示すもの。個々の農場に作業スケジューラー需要があることまでは示さない。

2. 農林水産省「持続可能な農業構造への転換に向けた取組」  
   https://www.maff.go.jp/j/wpaper/w_maff/r7/r7_h/trend/part1/chap3/c3_2_00.html  
   限られた労働力・農地・資材の効率的利用が政策課題として説明される。上記センサスと時点/定義が異なる場合があるため数値を混ぜない。

## 要件工学

3. ISO/IEC/IEEE 29148:2018, *Systems and software engineering — Requirements engineering*  
   https://www.iso.org/standard/72089.html  
   要求工学プロセスと要求情報の考え方を参考にする。規格本文の完全適用・認証を主張しない。

## 技術実現可能性（設計に移る際の候補情報）

4. Google OR-Tools — Scheduling recipes  
   https://github.com/google/or-tools/blob/stable/ortools/sat/docs/scheduling.md  
   区間変数、資源の重複禁止、作業順序、makespanを扱う公式資料。採用決定ではない。

5. GitHub Docs — Creating a new repository  
   https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository  
   新規リポジトリの作成・初期化・管理手順。

## 残る調査
- 対象作物と作業単位の典型値（作業時間、同時使用資源）
- 農業従事者への要求ヒアリング・既存業務の観察
- 競合製品の仕様・価格・運用形態
- 無料クラウドの最新規約、実行制限、外部API利用規約

**留意:** 外部公的統計・技術資料と、未検証の製品仮説を区別して管理する。
