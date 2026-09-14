/**
 * UI translation dictionary.
 *
 * English and Vietnamese sit next to each other for the same key so the two can
 * never drift apart. `{name}` placeholders are substituted by `translate()`.
 */

export type Language = 'en' | 'vi';

export const LANGUAGES: Language[] = ['en', 'vi'];

interface Message {
  en: string;
  vi: string;
}

const MESSAGES = {
  /* ---------------- shared ---------------- */
  'app.name': { en: 'Mammo QA Workbench', vi: 'Bảng kiểm Mammo QA' },
  'common.cancel': { en: 'Cancel', vi: 'Huỷ' },
  'common.close': { en: 'Close', vi: 'Đóng' },
  'common.saving': { en: 'Saving…', vi: 'Đang lưu…' },

  /* ---------------- top bar ---------------- */
  'nav.predict': { en: 'Predict', vi: 'Dự đoán' },
  'nav.predictHint': {
    en: 'Score a single PNG or DICOM mammogram with the model',
    vi: 'Chạy mô hình trên một ảnh nhũ ảnh PNG hoặc DICOM',
  },
  'nav.review': { en: 'Review dataset', vi: 'Duyệt dữ liệu' },
  'nav.reviewHint': {
    en: 'Approve or relabel the AI predictions in the worklist',
    vi: 'Chấp nhận hoặc gán lại nhãn AI trong danh sách',
  },
  'nav.disclaimer': {
    en: 'Research prototype · not for clinical use',
    vi: 'Bản thử nghiệm · không dùng cho lâm sàng',
  },
  'lang.switchToEnglish': { en: 'Switch to English', vi: 'Chuyển sang tiếng Anh' },
  'lang.switchToVietnamese': {
    en: 'Switch to Vietnamese',
    vi: 'Chuyển sang tiếng Việt',
  },

  /* ---------------- help / instructions ---------------- */
  'help.open': { en: 'Help', vi: 'Hướng dẫn' },
  'help.openHint': { en: 'How to use this tool', vi: 'Cách sử dụng công cụ' },
  'help.title': { en: 'How to use this tool', vi: 'Hướng dẫn sử dụng' },
  'help.intro': {
    en: 'The workbench has two modes. Switch between them with the tabs in the top bar.',
    vi: 'Công cụ có hai chế độ. Chuyển đổi bằng các tab trên thanh trên cùng.',
  },
  'help.mode1.title': {
    en: '1 · Predict — label one image',
    vi: '1 · Dự đoán — gán nhãn một ảnh',
  },
  'help.mode1.step1': { en: 'Open the Predict tab.', vi: 'Mở tab Dự đoán.' },
  'help.mode1.step2': {
    en: 'Drop in a PNG/JPG or DICOM mammogram, or pick one of the bundled samples.',
    vi: 'Kéo thả ảnh PNG/JPG hoặc DICOM, hoặc chọn một ảnh mẫu có sẵn.',
  },
  'help.mode1.step3': {
    en: 'Enter the patient age and breast density — both are inputs to the model and change the result.',
    vi: 'Nhập tuổi bệnh nhân và mật độ vú — cả hai là đầu vào của mô hình và làm thay đổi kết quả.',
  },
  'help.mode1.step4': {
    en: 'Press Run prediction (about 10–20 s on CPU) and read the BI-RADS assessment, class probabilities and per-fold breakdown.',
    vi: 'Nhấn Chạy dự đoán (khoảng 10–20 giây trên CPU) rồi xem kết quả BI-RADS, xác suất từng lớp và chi tiết theo từng fold.',
  },
  'help.mode1.step5': {
    en: 'If the image belongs to the dataset, press Approve this label to record it.',
    vi: 'Nếu ảnh thuộc bộ dữ liệu, nhấn Chấp nhận nhãn này để lưu lại.',
  },
  'help.mode2.title': {
    en: '2 · Review dataset — approve or relabel',
    vi: '2 · Duyệt dữ liệu — chấp nhận hoặc gán lại nhãn',
  },
  'help.mode2.step1': {
    en: 'On first use, enter your reviewer name, specialty and reviewer ID.',
    vi: 'Lần đầu sử dụng, nhập tên, chuyên khoa và mã bác sĩ của bạn.',
  },
  'help.mode2.step2': {
    en: 'Choose a patient in the left rail — search by patient ID, or filter by review status.',
    vi: 'Chọn bệnh nhân ở cột bên trái — tìm theo mã bệnh nhân hoặc lọc theo trạng thái duyệt.',
  },
  'help.mode2.step3': {
    en: 'Compare the mammogram with the AI assessment, then press Approve AI label or Relabel image.',
    vi: 'Đối chiếu ảnh với kết quả AI, sau đó nhấn Chấp nhận nhãn AI hoặc Gán lại nhãn.',
  },
  'help.mode2.step4': {
    en: 'Every decision is sent to /api/validation and kept in the session log for audit.',
    vi: 'Mọi quyết định được gửi tới /api/validation và lưu trong nhật ký phiên để kiểm toán.',
  },
  'help.unlabeled.title': { en: 'Images with no label', vi: 'Ảnh chưa có nhãn' },
  'help.unlabeled.body': {
    en: 'Dataset images without an AI label are marked “no label”, listed first and highlighted by an amber banner. Open one and press Predict this label — the returned label can then be approved, and it shows as approved in the worklist.',
    vi: 'Những ảnh chưa có nhãn AI được đánh dấu “chưa có nhãn”, xếp lên đầu và có dải cảnh báo màu vàng. Mở ảnh đó và nhấn Dự đoán nhãn này — nhãn trả về có thể được chấp nhận và sẽ hiện là “đã duyệt” trong danh sách.',
  },
  'help.viewer.title': { en: 'Reading the image', vi: 'Cách xem ảnh' },
  'help.viewer.body': {
    en: 'Drag to pan, scroll to zoom, and use the brightness / contrast sliders to adjust the display. Reset restores everything; double-click fits the image to the window.',
    vi: 'Kéo để di chuyển, cuộn để phóng to / thu nhỏ, dùng thanh trượt độ sáng và độ tương phản để chỉnh hiển thị. Nút Đặt lại khôi phục tất cả; nháy đúp để vừa khung hình.',
  },
  'help.shortcuts.title': {
    en: 'Keyboard shortcuts (review mode)',
    vi: 'Phím tắt (chế độ duyệt)',
  },
  'help.shortcuts.approve': { en: 'approve the AI label', vi: 'chấp nhận nhãn AI' },
  'help.shortcuts.relabel': {
    en: 'open the relabel dialog',
    vi: 'mở hộp thoại gán lại nhãn',
  },
  'help.shortcuts.view': { en: 'previous / next view', vi: 'ảnh trước / ảnh kế tiếp' },
  'help.shortcuts.patient': {
    en: 'previous / next patient',
    vi: 'bệnh nhân trước / bệnh nhân kế tiếp',
  },
  'help.shortcuts.jump': { en: 'first / last image', vi: 'ảnh đầu / ảnh cuối' },
  'help.models.title': { en: 'Model and limitations', vi: 'Mô hình và giới hạn' },
  'help.models.body': {
    en: 'SwinV2 + FT-Transformer + cross-attention with a CatBoost head, averaged over 4 folds. It returns a 3-class collapse (BI-RADS 1 / 2-3 / 4-5), not the full BI-RADS scale. Trained on VinDr-Mammo and not clinically validated.',
    vi: 'SwinV2 + FT-Transformer + cross-attention với đầu CatBoost, lấy trung bình 4 fold. Kết quả gộp 3 lớp (BI-RADS 1 / 2-3 / 4-5), không phải thang BI-RADS đầy đủ. Huấn luyện trên VinDr-Mammo và chưa được kiểm chứng lâm sàng.',
  },
  'help.close': { en: 'Got it', vi: 'Đã hiểu' },

  /* ---------------- reviewer setup ---------------- */
  'setup.title': { en: 'Reviewer setup', vi: 'Thiết lập bác sĩ đọc' },
  'setup.intro': {
    en: 'Your identity is stamped on every decision so the audit trail stays complete.',
    vi: 'Danh tính của bạn được ghi kèm mọi quyết định để nhật ký kiểm toán luôn đầy đủ.',
  },
  'setup.name': { en: 'Reviewer name', vi: 'Tên bác sĩ' },
  'setup.namePlaceholder': { en: 'e.g. Dr. Nguyen Van A', vi: 'ví dụ: BS. Nguyễn Văn A' },
  'setup.specialty': { en: 'Specialty', vi: 'Chuyên khoa' },
  'setup.specialtyBreast': { en: 'Breast Imaging', vi: 'Chẩn đoán hình ảnh tuyến vú' },
  'setup.specialtyGeneral': { en: 'General Radiology', vi: 'Chẩn đoán hình ảnh tổng quát' },
  'setup.specialtyOther': { en: 'Other', vi: 'Khác' },
  'setup.id': { en: 'Reviewer ID', vi: 'Mã bác sĩ' },
  'setup.idHint': {
    en: 'Generated automatically — edit if your site uses its own IDs.',
    vi: 'Tự sinh — bạn có thể sửa nếu đơn vị dùng mã riêng.',
  },
  'setup.start': { en: 'Start reviewing', vi: 'Bắt đầu' },
  'setup.nameRequired': { en: 'Reviewer name is required.', vi: 'Vui lòng nhập tên bác sĩ.' },
  'setup.specialtyRequired': { en: 'Specialty is required.', vi: 'Vui lòng chọn chuyên khoa.' },
  'setup.idRequired': { en: 'Reviewer ID is required.', vi: 'Vui lòng nhập mã bác sĩ.' },
  'setup.switchTitle': { en: 'Switch reviewer?', vi: 'Đổi bác sĩ đọc?' },
  'setup.switch': { en: 'Switch', vi: 'Đổi' },
  'setup.currentlyAs': { en: 'You are currently reviewing as:', vi: 'Bạn đang duyệt với tư cách:' },
  'setup.switchBody': {
    en: 'Switching generates a new reviewer ID. It is stamped on all future decisions; already-recorded decisions stay linked to the current reviewer. You will be returned to the setup screen.',
    vi: 'Khi đổi, một mã bác sĩ mới sẽ được tạo và ghi kèm cho các quyết định sau này. Các quyết định đã ghi vẫn thuộc bác sĩ hiện tại. Bạn sẽ quay lại màn hình thiết lập.',
  },

  /* ---------------- predict mode ---------------- */
  'predict.imageSection': { en: '1 · Mammogram', vi: '1 · Ảnh nhũ ảnh' },
  'predict.dropHint': { en: 'Drop a PNG or DICOM here', vi: 'Kéo thả ảnh PNG hoặc DICOM vào đây' },
  'predict.browse': { en: 'Browse file', vi: 'Chọn tệp' },
  'predict.bundledSamples': { en: 'or a bundled sample', vi: 'hoặc ảnh mẫu có sẵn' },
  'predict.clearSelection': { en: 'Clear selection', vi: 'Bỏ chọn' },
  'predict.clinicalSection': { en: '2 · Clinical inputs', vi: '2 · Thông tin lâm sàng' },
  'predict.age': { en: 'Patient age', vi: 'Tuổi bệnh nhân' },
  'predict.density': { en: 'Breast density (BI-RADS)', vi: 'Mật độ vú (BI-RADS)' },
  'predict.densityA': { en: 'A — mostly fatty', vi: 'A — chủ yếu mỡ' },
  'predict.densityB': { en: 'B — scattered fibroglandular', vi: 'B — mô tuyến rải rác' },
  'predict.densityC': { en: 'C — heterogeneously dense', vi: 'C — mật độ không đồng nhất' },
  'predict.densityD': { en: 'D — extremely dense', vi: 'D — rất đặc' },
  'predict.inputsNote': {
    en: 'Age and density are model inputs — they change the prediction, so use the patient’s real values.',
    vi: 'Tuổi và mật độ là đầu vào của mô hình — chúng làm thay đổi kết quả, nên dùng giá trị thật của bệnh nhân.',
  },
  'predict.run': { en: 'Run prediction', vi: 'Chạy dự đoán' },
  'predict.scoring': { en: 'Scoring…', vi: 'Đang tính…' },
  'predict.runningNote': {
    en: 'Running the 4-fold ensemble — about 10–20 s on CPU.',
    vi: 'Đang chạy tổ hợp 4 fold — khoảng 10–20 giây trên CPU.',
  },
  'predict.ensemble': { en: 'Ensemble', vi: 'Tổ hợp mô hình' },
  'predict.connecting': {
    en: 'Connecting to the prediction worker…',
    vi: 'Đang kết nối tới tiến trình dự đoán…',
  },
  'predict.workerReady': {
    en: '{count} fold models ready (folds {folds}, {features} latent features)',
    vi: 'Đã nạp {count} mô hình fold (fold {folds}, {features} đặc trưng ẩn)',
  },
  'predict.workerUnavailable': {
    en: 'Prediction worker unavailable.',
    vi: 'Không kết nối được tiến trình dự đoán.',
  },

  'predict.emptyTitle': { en: 'No image selected', vi: 'Chưa chọn ảnh' },
  'predict.emptyHint': {
    en: 'Upload a PNG/JPG or DICOM mammogram — or pick a bundled sample — to score it with the model.',
    vi: 'Tải lên ảnh PNG/JPG hoặc DICOM — hoặc chọn ảnh mẫu — để mô hình dự đoán.',
  },
  'predict.noResultTitle': { en: 'No prediction yet', vi: 'Chưa có kết quả' },
  'predict.noResultHint': {
    en: 'Choose a PNG or DICOM mammogram, fill in the clinical inputs and run the model to see its BI-RADS assessment.',
    vi: 'Chọn ảnh PNG hoặc DICOM, nhập thông tin lâm sàng và chạy mô hình để xem kết quả BI-RADS.',
  },
  'predict.predictedAssessment': { en: 'Predicted assessment', vi: 'Kết quả dự đoán' },
  'predict.ensembleConfidence': { en: 'Ensemble confidence', vi: 'Độ tin cậy tổ hợp' },
  'predict.classProbabilities': { en: 'Class probabilities', vi: 'Xác suất theo lớp' },
  'predict.perFold': { en: 'Per-fold breakdown ({count})', vi: 'Chi tiết theo fold ({count})' },
  'predict.perFoldNote': {
    en: 'Numbers are percentages of Normal / Benign-leaning / Suspicious. Disagreement between folds is expected near decision boundaries.',
    vi: 'Các số là phần trăm của Bình thường / Nghiêng lành tính / Nghi ngờ. Các fold có thể khác nhau ở vùng ranh giới quyết định.',
  },
  'predict.model': { en: 'Model', vi: 'Mô hình' },
  'predict.inference': { en: 'inference', vi: 'thời gian suy luận' },
  'predict.ageError': {
    en: 'Enter a patient age between 1 and 120.',
    vi: 'Nhập tuổi bệnh nhân trong khoảng 1 đến 120.',
  },
  'predict.failed': { en: 'Prediction failed.', vi: 'Dự đoán thất bại.' },
  'predict.saveFailed': { en: 'Could not save the label.', vi: 'Không lưu được nhãn.' },
  'predict.signoffTitle': { en: 'Radiologist sign-off', vi: 'Bác sĩ xác nhận' },
  'predict.signoffBody': {
    en: 'Approving stores {label} as the reviewed label for this dataset image.',
    vi: 'Khi chấp nhận, {label} sẽ được lưu làm nhãn đã duyệt cho ảnh này.',
  },
  'predict.approve': { en: 'Approve this label', vi: 'Chấp nhận nhãn này' },
  'predict.approvedNote': {
    en: 'Label recorded for {imageId}. It now shows as approved in the worklist.',
    vi: 'Đã lưu nhãn cho {imageId}. Ảnh này hiện là “đã duyệt” trong danh sách.',
  },
  'predict.backToReview': { en: 'Back to review', vi: 'Quay lại duyệt dữ liệu' },
  'predict.annotationImage': {
    en: 'Prediction input · image',
    vi: 'Ảnh đầu vào · ảnh thường',
  },
  'predict.annotationDicom': { en: 'Prediction input · DICOM', vi: 'Ảnh đầu vào · DICOM' },
  'predict.classNormal': { en: 'Normal', vi: 'Bình thường' },
  'predict.classBenign': { en: 'Benign-leaning', vi: 'Nghiêng lành tính' },
  'predict.classSuspicious': { en: 'Suspicious', vi: 'Nghi ngờ' },
  'predict.inputLabel': { en: 'input', vi: 'đầu vào' },
  'predict.disclaimer': {
    en: 'Research model trained on VinDr-Mammo. Output is a 3-class collapse (BI-RADS 1 / 2-3 / 4-5) and must not be used for diagnosis.',
    vi: 'Mô hình nghiên cứu huấn luyện trên VinDr-Mammo. Kết quả gộp 3 lớp (BI-RADS 1 / 2-3 / 4-5) và không được dùng để chẩn đoán.',
  },

  /* ---------------- review mode ---------------- */
  'review.preparing': { en: 'Preparing workbench…', vi: 'Đang chuẩn bị…' },
  'review.loadingWorklist': { en: 'Loading worklist…', vi: 'Đang tải danh sách…' },
  'review.loadingHint': {
    en: 'Fetching cases and AI predictions from /api/cases.',
    vi: 'Đang lấy danh sách và dự đoán AI từ /api/cases.',
  },
  'review.loadError': { en: 'Could not load the worklist', vi: 'Không tải được danh sách' },
  'review.emptyTitle': { en: 'No cases available', vi: 'Không có ảnh nào' },
  'review.emptyHint': {
    en: 'The worklist contains no cases. Run the sample-data generator or check /api/cases.',
    vi: 'Danh sách trống. Hãy chạy script tạo dữ liệu mẫu hoặc kiểm tra /api/cases.',
  },
  'review.retry': { en: 'Retry', vi: 'Thử lại' },
  'review.unlabeledOne': {
    en: '1 image in this dataset has no AI label — open it, use “Predict this label”, then approve it.',
    vi: '1 ảnh trong bộ dữ liệu chưa có nhãn AI — mở ảnh, nhấn “Dự đoán nhãn này”, rồi chấp nhận.',
  },
  'review.unlabeledMany': {
    en: '{count} images in this dataset have no AI label — open one, use “Predict this label”, then approve it.',
    vi: '{count} ảnh trong bộ dữ liệu chưa có nhãn AI — mở ảnh, nhấn “Dự đoán nhãn này”, rồi chấp nhận.',
  },
  'review.jumpToFirst': { en: 'Jump to first', vi: 'Tới ảnh đầu tiên' },
  'review.connecting': { en: 'Connecting to worklist…', vi: 'Đang kết nối danh sách…' },
  'review.switchReviewer': { en: 'Switch reviewer', vi: 'Đổi bác sĩ' },
  /* ---------------- queue rail ---------------- */
  'queue.title': { en: 'Patients · {count}', vi: 'Bệnh nhân · {count}' },
  'queue.views': { en: '{count} views', vi: '{count} ảnh' },
  'queue.searchPlaceholder': { en: 'Find patient ID…', vi: 'Tìm mã bệnh nhân…' },
  'queue.clearSearch': { en: 'Clear search', vi: 'Xoá tìm kiếm' },
  'queue.filterAll': { en: 'All', vi: 'Tất cả' },
  'queue.filterNoLabel': { en: 'No label', vi: 'Chưa có nhãn' },
  'queue.filterPending': { en: 'Pending', vi: 'Chờ duyệt' },
  'queue.filterApproved': { en: 'Approved', vi: 'Đã duyệt' },
  'queue.filterRelabeled': { en: 'Relabeled', vi: 'Đã gán lại' },
  'queue.empty': { en: 'Empty worklist', vi: 'Danh sách trống' },
  'queue.noMatch': { en: 'No patient matches that ID.', vi: 'Không tìm thấy bệnh nhân phù hợp.' },
  'queue.noLabelBadge': { en: 'no label', vi: 'chưa có nhãn' },
  'queue.noLabelHint': {
    en: 'No AI label yet — open it and predict the label',
    vi: 'Chưa có nhãn AI — mở ảnh và dự đoán nhãn',
  },
  'queue.approvedCount': { en: '{count} approved', vi: '{count} đã duyệt' },
  'queue.relabeledCount': { en: '{count} relabeled', vi: '{count} đã gán lại' },
  'queue.pendingCount': { en: '{count} pending', vi: '{count} chờ duyệt' },
  'queue.statusPending': { en: 'Pending', vi: 'Chờ duyệt' },
  'queue.statusApproved': { en: 'Approved', vi: 'Đã duyệt' },
  'queue.statusRelabeled': { en: 'Relabeled', vi: 'Đã gán lại' },
  'queue.statusSaving': { en: 'Saving…', vi: 'Đang lưu…' },

  /* ---------------- validation panel ---------------- */
  'panel.aiAssessment': { en: 'AI assessment', vi: 'Kết quả AI' },
  'panel.unlabeled': { en: 'Unlabeled', vi: 'Chưa có nhãn' },
  'panel.noLabelTitle': { en: 'No AI label for this image', vi: 'Ảnh này chưa có nhãn AI' },
  'panel.noLabelBody': {
    en: 'This dataset image has not been scored yet. Run the model, check its assessment, then approve the returned label.',
    vi: 'Ảnh trong bộ dữ liệu này chưa được chạy mô hình. Hãy chạy mô hình, kiểm tra kết quả rồi chấp nhận nhãn trả về.',
  },
  'panel.predictThisLabel': { en: 'Predict this label', vi: 'Dự đoán nhãn này' },
  'panel.radiologistDecision': { en: 'Radiologist decision', vi: 'Quyết định của bác sĩ' },
  'panel.predictFirst': {
    en: 'Predict a label first — you can then approve it',
    vi: 'Hãy dự đoán nhãn trước — sau đó bạn có thể chấp nhận',
  },
  'panel.yourDecision': { en: 'Your decision', vi: 'Quyết định của bạn' },
  'panel.approved': { en: 'APPROVED', vi: 'ĐÃ DUYỆT' },
  'panel.currentlyApproved': { en: 'Currently approved', vi: 'Đã duyệt' },
  'panel.relabeled': { en: 'RELABELED', vi: 'ĐÃ GÁN LẠI' },
  'panel.matchesAi': { en: 'matches AI label', vi: 'trùng với nhãn AI' },
  'panel.awaiting': {
    en: 'Awaiting your review — approve or relabel below',
    vi: 'Chưa duyệt — hãy chấp nhận hoặc gán lại bên dưới',
  },
  'panel.approveAiLabel': { en: 'Approve AI label', vi: 'Chấp nhận nhãn AI' },
  'panel.approveUpdate': { en: 'Approve (update)', vi: 'Chấp nhận (cập nhật)' },
  'panel.relabelImage': { en: 'Relabel image', vi: 'Gán lại nhãn' },
  'panel.aiFindings': { en: 'AI findings', vi: 'Phát hiện của AI' },
  'panel.noFindings': { en: 'None detected', vi: 'Không phát hiện' },
  'panel.modelConfidence': { en: 'Model confidence', vi: 'Độ tin cậy mô hình' },
  'panel.altProbabilities': {
    en: 'Alternative BI-RADS probabilities',
    vi: 'Xác suất BI-RADS khác',
  },

  /* ---------------- viewer / footer ---------------- */
  'viewer.decoding': { en: 'Decoding mammogram…', vi: 'Đang giải mã ảnh…' },
  'viewer.stageErrorTitle': { en: 'Could not display this image.', vi: 'Không hiển thị được ảnh này.' },
  'viewer.stageErrorBody': {
    en: 'The file may be missing or malformed. Skip to the next case.',
    vi: 'Tệp có thể bị thiếu hoặc lỗi. Hãy chuyển sang ảnh tiếp theo.',
  },
  'viewer.brightness': { en: 'Brightness', vi: 'Độ sáng' },
  'viewer.contrast': { en: 'Contrast', vi: 'Độ tương phản' },
  'viewer.reset': { en: 'Reset', vi: 'Đặt lại' },
  'viewer.zoomIn': { en: 'Zoom in', vi: 'Phóng to' },
  'viewer.zoomOut': { en: 'Zoom out', vi: 'Thu nhỏ' },
  'viewer.resetHint': {
    en: 'Reset brightness, contrast, zoom and pan',
    vi: 'Đặt lại độ sáng, độ tương phản, phóng to và vị trí',
  },
  'footer.reviewed': { en: '{done}/{total} reviewed', vi: 'Đã duyệt {done}/{total}' },
  'footer.approved': { en: '{count} approved', vi: '{count} đã duyệt' },
  'footer.relabeled': { en: '{count} relabeled', vi: '{count} đã gán lại' },
  'footer.complete': { en: 'Worklist complete', vi: 'Đã duyệt hết' },
  'footer.approveKey': { en: 'approve', vi: 'chấp nhận' },
  'footer.relabelKey': { en: 'relabel', vi: 'gán lại' },
  'footer.viewKey': { en: 'view', vi: 'ảnh' },
  'footer.patientKey': { en: 'patient', vi: 'bệnh nhân' },
  'footer.prevPatient': { en: 'Previous patient (↑)', vi: 'Bệnh nhân trước (↑)' },
  'footer.nextPatient': { en: 'Next patient (↓)', vi: 'Bệnh nhân kế tiếp (↓)' },
  'footer.prevView': { en: 'Previous view (←)', vi: 'Ảnh trước (←)' },
  'footer.nextView': { en: 'Next view (→)', vi: 'Ảnh kế tiếp (→)' },

  /* ---------------- relabel dialog ---------------- */
  'relabel.title': { en: 'Relabel patient {patientId}', vi: 'Gán lại nhãn cho bệnh nhân {patientId}' },
  'relabel.aiSuggestion': { en: 'AI suggestion', vi: 'Gợi ý của AI' },
  'relabel.noAiLabel': { en: 'No AI label yet', vi: 'Chưa có nhãn AI' },
  'relabel.confirm': { en: 'Confirm relabel', vi: 'Xác nhận gán lại' },
  'relabel.notes': { en: 'Notes (optional)', vi: 'Ghi chú (không bắt buộc)' },

  /* ---------------- extra setup strings ---------------- */
  'setup.brandSub': { en: 'Reviewer setup', vi: 'Thiết lập bác sĩ đọc' },
  'setup.localNote': {
    en: 'This identity is stored locally in this browser only, and its reviewer ID is stamped on every validation decision recorded in this session.',
    vi: 'Danh tính này chỉ được lưu cục bộ trong trình duyệt, và mã bác sĩ sẽ được ghi kèm mọi quyết định trong phiên làm việc này.',
  },
  'setup.required': { en: '(required)', vi: '(bắt buộc)' },
  'setup.editable': { en: '(editable)', vi: '(có thể sửa)' },
  'setup.enter': { en: 'Enter workbench', vi: 'Vào làm việc' },
  'setup.enterHint': { en: 'Enter the workbench as this reviewer', vi: 'Vào làm việc với tư cách bác sĩ này' },
  'setup.nameBlocker': { en: 'Add a reviewer name.', vi: 'Hãy nhập tên bác sĩ.' },
  'setup.specialtyBlocker': { en: 'Pick a specialty.', vi: 'Hãy chọn chuyên khoa.' },
  'setup.idBlocker': { en: 'Enter a reviewer ID.', vi: 'Hãy nhập mã bác sĩ.' },
} as const satisfies Record<string, Message>;

export type TranslationKey = keyof typeof MESSAGES;

/** Look up `key` for `language`, substituting `{placeholder}` values. */
export function translate(
  language: Language,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  const entry = MESSAGES[key] as Message | undefined;
  let text = entry ? entry[language] : key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}
